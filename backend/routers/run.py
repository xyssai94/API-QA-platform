import json
import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models.endpoint import Endpoint
from models.test_session import TestSession
from models.test_result import TestResult
from schemas.test_run import SingleRunRequest
from adapters.base import RunRequest
from adapters.openai_cc import OpenAICCAdapter
from adapters.anthropic_native import AnthropicNativeAdapter
from adapters.gemini_native import GeminiNativeAdapter
from adapters.openai_responses import OpenAIResponsesAdapter

router = APIRouter(prefix="/run", tags=["run"])

ADAPTERS = {
    "openai_cc": OpenAICCAdapter(),
    "anthropic": AnthropicNativeAdapter(),
    "gemini": GeminiNativeAdapter(),
    "openai_resp": OpenAIResponsesAdapter(),
}


def _get_adapter(protocol: str):
    adapter = ADAPTERS.get(protocol)
    if not adapter:
        raise HTTPException(status_code=400, detail=f"不支持的协议: {protocol}")
    return adapter


def _build_run_request(ep: Endpoint, body: SingleRunRequest) -> RunRequest:
    params: dict = {}
    if body.params:
        p = body.params
        if p.temperature is not None:
            params["temperature"] = p.temperature
        if p.max_tokens is not None:
            params["max_tokens"] = p.max_tokens
        if p.top_p is not None:
            params["top_p"] = p.top_p
        if p.stop is not None:
            params["stop"] = p.stop
        if p.extra:
            params.update(p.extra)

    extra_headers = json.loads(ep.extra_headers) if ep.extra_headers else None

    return RunRequest(
        base_url=ep.base_url,
        api_key=ep.api_key,
        model=body.model,
        messages=body.messages,
        system_prompt=body.system_prompt,
        params=params,
        extra_headers=extra_headers,
        proxy=ep.proxy,
        stream=body.stream,
    )


def _save_result(db: Session, session_id: int, body: SingleRunRequest, result) -> None:
    db.add(TestResult(
        session_id=session_id,
        request_snapshot=json.dumps({
            "endpoint_id": body.endpoint_id,
            "model": body.model,
            "messages": body.messages,
            "system_prompt": body.system_prompt,
        }, ensure_ascii=False),
        response_text=result.response_text,
        thinking_text=result.thinking_text or None,
        ttft_ms=result.ttft_ms,
        total_ms=result.total_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        reasoning_tokens=result.reasoning_tokens,
        tokens_per_second=result.tokens_per_second,
        status="error" if result.error else "ok",
        error_msg=result.error,
    ))
    db.commit()


@router.post("/single")
async def run_single(body: SingleRunRequest, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, body.endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    adapter = _get_adapter(ep.protocol)
    req = _build_run_request(ep, body)

    session = TestSession(type="single", status="running")
    db.add(session)
    db.commit()
    db.refresh(session)

    if not body.stream:
        result = await adapter.run(req)
        session.status = "done" if not result.error else "error"
        db.commit()
        _save_result(db, session.id, body, result)
        if result.error:
            raise HTTPException(status_code=502, detail=result.error)
        return {
            "session_id": session.id,
            "response": result.response_text,
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
        }

    # 流式输出
    async def event_stream():
        full_text = ""
        ttft_ms = None
        result_usage = {}
        total_ms = None
        error = None

        async for chunk in adapter.stream(req):
            if chunk.type == "content":
                full_text += chunk.content
                if chunk.ttft_ms:
                    ttft_ms = chunk.ttft_ms
                yield f"data: {json.dumps({'type': 'content', 'content': chunk.content, 'ttft_ms': chunk.ttft_ms}, ensure_ascii=False)}\n\n"

            elif chunk.type == "done":
                result_usage = chunk.usage or {}
                total_ms = chunk.total_ms
                yield f"data: {json.dumps({'type': 'done', 'usage': result_usage, 'total_ms': total_ms}, ensure_ascii=False)}\n\n"

            elif chunk.type == "error":
                error = chunk.error
                yield f"data: {json.dumps({'type': 'error', 'error': error}, ensure_ascii=False)}\n\n"

        # 写库
        from adapters.base import RunResult
        final = RunResult(
            response_text=full_text,
            ttft_ms=ttft_ms,
            total_ms=total_ms,
            input_tokens=result_usage.get("input_tokens"),
            output_tokens=result_usage.get("output_tokens"),
            cache_read_tokens=result_usage.get("cache_read_tokens"),
            cache_write_tokens=result_usage.get("cache_write_tokens"),
            reasoning_tokens=result_usage.get("reasoning_tokens"),
            tokens_per_second=result_usage.get("tokens_per_second"),
            error=error,
        )
        session.status = "done" if not error else "error"
        db.commit()
        _save_result(db, session.id, body, final)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
