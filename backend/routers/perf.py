import asyncio
import statistics
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models.endpoint import Endpoint
from models.test_session import TestSession
from models.test_result import TestResult
from routers.run import ADAPTERS, _build_run_request
from schemas.test_run import RunParams, SingleRunRequest

router = APIRouter(prefix="/run", tags=["perf"])


class PerfRequest(BaseModel):
    endpoint_id: int
    model: str
    messages: list[dict]
    system_prompt: Optional[str] = None
    params: Optional[RunParams] = None
    n: int = 10
    concurrency: int = 1


def _safe_stats(vals: list[float]) -> Optional[dict]:
    if not vals:
        return None
    sv = sorted(vals)
    p95_idx = max(0, int(len(sv) * 0.95) - 1)
    return {
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
        "avg": round(statistics.mean(vals), 1),
        "p50": round(statistics.median(vals), 1),
        "p95": round(sv[p95_idx], 1),
    }


@router.post("/perf")
async def run_perf(body: PerfRequest, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, body.endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    adapter = ADAPTERS.get(ep.protocol)
    if not adapter:
        raise HTTPException(status_code=400, detail=f"不支持的协议: {ep.protocol}")

    fake = SingleRunRequest(
        endpoint_id=body.endpoint_id,
        model=body.model,
        messages=body.messages,
        system_prompt=body.system_prompt,
        params=body.params,
        stream=False,
    )
    req = _build_run_request(ep, fake)
    snapshot = json.dumps({
        "endpoint_id": body.endpoint_id,
        "model": body.model,
        "messages": body.messages,
    }, ensure_ascii=False)

    session = TestSession(type="perf", status="running")
    db.add(session)
    db.commit()
    db.refresh(session)
    session_id = session.id

    async def event_stream():
        semaphore = asyncio.Semaphore(body.concurrency)
        queue: asyncio.Queue = asyncio.Queue()

        async def run_one(index: int) -> None:
            async with semaphore:
                try:
                    result = await adapter.run(req)
                    item = {
                        "index": index,
                        "ttft_ms": result.ttft_ms,
                        "total_ms": result.total_ms,
                        "input_tokens": result.input_tokens,
                        "output_tokens": result.output_tokens,
                        "tokens_per_second": result.tokens_per_second,
                        "error": result.error,
                    }
                    db.add(TestResult(
                        session_id=session_id,
                        request_snapshot=snapshot,
                        response_text=result.response_text,
                        ttft_ms=result.ttft_ms,
                        total_ms=result.total_ms,
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                        cache_read_tokens=result.cache_read_tokens,
                        tokens_per_second=result.tokens_per_second,
                        status="error" if result.error else "ok",
                        error_msg=result.error,
                    ))
                    db.commit()
                except Exception as e:
                    item = {"index": index, "error": str(e),
                            "ttft_ms": None, "total_ms": None,
                            "input_tokens": None, "output_tokens": None,
                            "tokens_per_second": None}
                    db.add(TestResult(
                        session_id=session_id,
                        request_snapshot=snapshot,
                        status="error",
                        error_msg=str(e),
                    ))
                    db.commit()
                await queue.put(item)

        tasks = [asyncio.create_task(run_one(i)) for i in range(body.n)]
        all_results = []

        for i in range(body.n):
            r = await queue.get()
            all_results.append(r)
            yield f"data: {json.dumps({'type': 'progress', 'completed': i + 1, 'total': body.n, 'result': r}, ensure_ascii=False)}\n\n"

        await asyncio.gather(*tasks, return_exceptions=True)

        ok = [r for r in all_results if not r.get("error")]
        errors = len(all_results) - len(ok)

        ttft_vals = [r["ttft_ms"] for r in ok if r.get("ttft_ms") is not None]
        total_vals = [r["total_ms"] for r in ok if r.get("total_ms") is not None]
        tps_vals = [r["tokens_per_second"] for r in ok if r.get("tokens_per_second") is not None]

        stats = {
            "count": body.n,
            "errors": errors,
            "ttft": _safe_stats(ttft_vals),
            "total": _safe_stats(total_vals),
            "tps": _safe_stats(tps_vals),
        }

        s = db.get(TestSession, session_id)
        if s:
            s.status = "done" if errors < body.n else "error"
            db.commit()

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'stats': stats}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
