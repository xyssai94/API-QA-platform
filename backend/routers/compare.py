import asyncio
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models.endpoint import Endpoint
from models.test_session import TestSession
from models.test_result import TestResult
from routers.run import ADAPTERS, _build_run_request
from schemas.test_run import RunParams, SingleRunRequest

router = APIRouter(prefix="/run", tags=["compare"])


class CompareConfig(BaseModel):
    endpoint_id: int
    model: str


class CompareRequest(BaseModel):
    messages: list[dict]
    system_prompt: Optional[str] = None
    params: Optional[RunParams] = None
    configs: list[CompareConfig]


async def _run_one(index: int, cfg: CompareConfig, body: CompareRequest, db: Session) -> dict:
    ep = db.get(Endpoint, cfg.endpoint_id)
    if not ep:
        return {
            "index": index, "endpoint_id": cfg.endpoint_id, "endpoint_name": "?",
            "model": cfg.model, "response": "", "thinking": "", "usage": {},
            "ttft_ms": None, "total_ms": None, "error": f"Endpoint {cfg.endpoint_id} not found",
        }

    adapter = ADAPTERS.get(ep.protocol)
    if not adapter:
        return {
            "index": index, "endpoint_id": cfg.endpoint_id, "endpoint_name": ep.name,
            "model": cfg.model, "response": "", "thinking": "", "usage": {},
            "ttft_ms": None, "total_ms": None, "error": f"不支持的协议: {ep.protocol}",
        }

    fake = SingleRunRequest(
        endpoint_id=cfg.endpoint_id,
        model=cfg.model,
        messages=body.messages,
        system_prompt=body.system_prompt,
        params=body.params,
        stream=False,
    )
    req = _build_run_request(ep, fake)

    try:
        result = await adapter.run(req)
        return {
            "index": index,
            "endpoint_id": cfg.endpoint_id,
            "endpoint_name": ep.name,
            "model": cfg.model,
            "response": result.response_text,
            "thinking": result.thinking_text or "",
            "usage": {
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "cache_read_tokens": result.cache_read_tokens,
                "cache_write_tokens": result.cache_write_tokens,
                "reasoning_tokens": result.reasoning_tokens,
                "tokens_per_second": result.tokens_per_second,
            },
            "ttft_ms": result.ttft_ms,
            "total_ms": result.total_ms,
            "error": result.error,
        }
    except Exception as e:
        return {
            "index": index, "endpoint_id": cfg.endpoint_id, "endpoint_name": ep.name,
            "model": cfg.model, "response": "", "thinking": "", "usage": {},
            "ttft_ms": None, "total_ms": None, "error": str(e),
        }


@router.post("/compare")
async def run_compare(body: CompareRequest, db: Session = Depends(get_db)):
    if not body.configs:
        return {"session_id": None, "results": []}

    tasks = [_run_one(i, cfg, body, db) for i, cfg in enumerate(body.configs)]
    results = list(await asyncio.gather(*tasks))

    # Save to history
    session = TestSession(type="compare", status="done")
    db.add(session)
    db.commit()
    db.refresh(session)

    for r in results:
        usage = r.get("usage") or {}
        db.add(TestResult(
            session_id=session.id,
            request_snapshot=json.dumps({
                "endpoint_id": r["endpoint_id"],
                "endpoint_name": r["endpoint_name"],
                "model": r["model"],
                "messages": body.messages,
            }, ensure_ascii=False),
            response_text=r.get("response", ""),
            ttft_ms=r.get("ttft_ms"),
            total_ms=r.get("total_ms"),
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            cache_read_tokens=usage.get("cache_read_tokens"),
            tokens_per_second=usage.get("tokens_per_second"),
            status="error" if r.get("error") else "ok",
            error_msg=r.get("error"),
        ))
    db.commit()

    return {"session_id": session.id, "results": results}
