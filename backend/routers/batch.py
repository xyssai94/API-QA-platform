import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models.endpoint import Endpoint
from models.test_case import TestCase
from models.test_session import TestSession
from models.test_result import TestResult
from routers.run import ADAPTERS, _build_run_request
from schemas.test_run import RunParams, SingleRunRequest

router = APIRouter(prefix="/run", tags=["batch"])


class BatchRequest(BaseModel):
    endpoint_id: int
    model: str
    test_case_ids: list[int]
    params: Optional[RunParams] = None


@router.post("/batch")
async def run_batch(body: BatchRequest, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, body.endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    adapter = ADAPTERS.get(ep.protocol)
    if not adapter:
        raise HTTPException(status_code=400, detail=f"不支持的协议: {ep.protocol}")

    test_cases = [db.get(TestCase, tc_id) for tc_id in body.test_case_ids]
    test_cases = [tc for tc in test_cases if tc is not None]
    if not test_cases:
        raise HTTPException(status_code=400, detail="没有有效的测试用例")

    session = TestSession(type="batch", status="running")
    db.add(session)
    db.commit()
    db.refresh(session)
    session_id = session.id

    async def event_stream():
        total = len(test_cases)
        completed = 0
        errors = 0

        for tc in test_cases:
            messages = json.loads(tc.messages) if isinstance(tc.messages, str) else tc.messages

            fake = SingleRunRequest(
                endpoint_id=body.endpoint_id,
                model=body.model,
                messages=messages,
                system_prompt=None,
                params=body.params,
                stream=False,
            )
            req = _build_run_request(ep, fake)

            try:
                result = await adapter.run(req)

                matched: Optional[bool] = None
                if tc.expected and result.response_text:
                    matched = tc.expected.strip() in result.response_text

                db.add(TestResult(
                    session_id=session_id,
                    test_case_id=tc.id,
                    request_snapshot=json.dumps({
                        "endpoint_id": body.endpoint_id,
                        "model": body.model,
                        "messages": messages,
                        "test_case_name": tc.name,
                    }, ensure_ascii=False),
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

                if result.error:
                    errors += 1
                completed += 1

                payload = {
                    "type": "progress",
                    "completed": completed,
                    "total": total,
                    "result": {
                        "test_case_id": tc.id,
                        "test_case_name": tc.name,
                        "response": result.response_text,
                        "ttft_ms": result.ttft_ms,
                        "total_ms": result.total_ms,
                        "output_tokens": result.output_tokens,
                        "tokens_per_second": result.tokens_per_second,
                        "matched": matched,
                        "error": result.error,
                    },
                }
            except Exception as e:
                completed += 1
                errors += 1
                payload = {
                    "type": "progress",
                    "completed": completed,
                    "total": total,
                    "result": {
                        "test_case_id": tc.id,
                        "test_case_name": tc.name,
                        "error": str(e),
                        "matched": None,
                    },
                }

            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        s = db.get(TestSession, session_id)
        if s:
            s.status = "error" if errors == total else "done"
            db.commit()

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'total': total, 'errors': errors}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
