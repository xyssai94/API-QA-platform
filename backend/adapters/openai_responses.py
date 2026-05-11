import time
import json
from typing import AsyncIterator, Optional
import httpx
from adapters.base import BaseAdapter, RunRequest, RunResult, ChunkEvent


class OpenAIResponsesAdapter(BaseAdapter):

    def _build_request(self, req: RunRequest) -> tuple[str, dict, dict]:
        base = req.base_url.rstrip("/")
        url = f"{base}/responses"

        # input 可以是字符串或数组
        # 这里简单转换：把 messages 的 content 拼起来
        if len(req.messages) == 1:
            input_data = req.messages[0]["content"]
        else:
            # 多轮拼成数组
            input_data = [{"role": m["role"], "content": m["content"]} for m in req.messages]

        body: dict = {"model": req.model, "input": input_data}

        if req.system_prompt:
            body["instructions"] = req.system_prompt

        # reasoning effort
        if "reasoning_effort" in req.params:
            body["reasoning"] = {"effort": req.params["reasoning_effort"]}

        # 其他参数
        if "temperature" in req.params:
            body["temperature"] = req.params["temperature"]
        if "max_tokens" in req.params:
            body["max_output_tokens"] = req.params["max_tokens"]

        # extra
        if "extra" in req.params:
            body.update(req.params["extra"])

        headers = {"Content-Type": "application/json"}
        if req.api_key:
            headers["Authorization"] = f"Bearer {req.api_key}"
        if req.extra_headers:
            headers.update(req.extra_headers)

        return url, headers, body

    def _client(self, req: RunRequest) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=120, proxy=req.proxy if req.proxy else None)

    def _parse_usage(self, usage: Optional[dict]) -> dict:
        if not usage:
            return {}
        return {
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "cache_read_tokens": usage.get("cached_tokens"),
            "reasoning_tokens": usage.get("reasoning_tokens"),
        }

    async def run(self, req: RunRequest) -> RunResult:
        url, headers, body = self._build_request(req)
        body["stream"] = False

        t0 = time.perf_counter()
        async with self._client(req) as client:
            try:
                resp = await client.post(url, headers=headers, json=body)
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                return RunResult(error=f"HTTP {e.response.status_code}: {e.response.text}")
            except Exception as e:
                return RunResult(error=str(e))

        total_ms = (time.perf_counter() - t0) * 1000
        data = resp.json()

        text = data.get("output", {}).get("content", "")
        reasoning = data.get("output", {}).get("reasoning", "")

        usage_info = self._parse_usage(data.get("usage"))
        out_tokens = usage_info.get("output_tokens") or 0
        tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None

        return RunResult(
            response_text=text,
            thinking_text=reasoning,
            total_ms=total_ms,
            tokens_per_second=tps,
            **usage_info,
        )

    async def stream(self, req: RunRequest) -> AsyncIterator[ChunkEvent]:
        url, headers, body = self._build_request(req)
        body["stream"] = True

        t0 = time.perf_counter()
        first_token = True

        async with self._client(req) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        err = await resp.aread()
                        yield ChunkEvent(type="error", error=f"HTTP {resp.status_code}: {err.decode()}")
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            break

                        try:
                            event = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = event.get("type")

                        if event_type == "content.delta":
                            delta = event.get("delta", {})
                            text = delta.get("content", "")
                            if text:
                                ttft = None
                                if first_token:
                                    ttft = (time.perf_counter() - t0) * 1000
                                    first_token = False
                                yield ChunkEvent(type="content", content=text, ttft_ms=ttft)

                        elif event_type == "reasoning.delta":
                            delta = event.get("delta", {})
                            reasoning = delta.get("reasoning", "")
                            if reasoning:
                                yield ChunkEvent(type="thinking", content=reasoning)

                        elif event_type == "response.done":
                            usage = event.get("response", {}).get("usage", {})
                            total_ms = (time.perf_counter() - t0) * 1000
                            usage_info = self._parse_usage(usage)
                            out_tokens = usage_info.get("output_tokens") or 0
                            tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None
                            yield ChunkEvent(
                                type="done",
                                usage={**usage_info, "tokens_per_second": tps},
                                total_ms=total_ms,
                            )

            except Exception as e:
                yield ChunkEvent(type="error", error=str(e))
