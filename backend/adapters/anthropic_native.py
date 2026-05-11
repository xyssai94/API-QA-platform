import time
import json
from typing import AsyncIterator, Optional
import httpx
from adapters.base import BaseAdapter, RunRequest, RunResult, ChunkEvent


class AnthropicNativeAdapter(BaseAdapter):

    def _build_request(self, req: RunRequest) -> tuple[str, dict, dict]:
        base = req.base_url.rstrip("/")
        url = f"{base}/messages"

        # Anthropic 原生协议 system 在顶层
        body: dict = {
            "model": req.model,
            "messages": req.messages,
            "max_tokens": req.params.get("max_tokens", 4096),
        }

        if req.system_prompt:
            body["system"] = req.system_prompt

        # 其他参数
        if "temperature" in req.params:
            body["temperature"] = req.params["temperature"]
        if "top_p" in req.params:
            body["top_p"] = req.params["top_p"]
        if "top_k" in req.params:
            body["top_k"] = req.params["top_k"]
        if "stop" in req.params:
            body["stop_sequences"] = req.params["stop"]

        # extra 里可能有 thinking、cache_control 等
        if "extra" in req.params:
            body.update(req.params["extra"])

        headers = {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        if req.api_key:
            headers["x-api-key"] = req.api_key
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
            "cache_read_tokens": usage.get("cache_read_input_tokens"),
            "cache_write_tokens": usage.get("cache_creation_input_tokens"),
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

        # 提取文本
        text = ""
        thinking = ""
        for block in data.get("content", []):
            if block["type"] == "text":
                text += block.get("text", "")
            elif block["type"] == "thinking":
                thinking += block.get("thinking", "")

        usage_info = self._parse_usage(data.get("usage"))
        out_tokens = usage_info.get("output_tokens") or 0
        tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None

        return RunResult(
            response_text=text,
            thinking_text=thinking,
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
                        raw = line[6:].strip()
                        if not raw:
                            continue

                        try:
                            event = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = event.get("type")

                        if event_type == "content_block_start":
                            # 首个 content block，可能是 text 或 thinking
                            pass

                        elif event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            delta_type = delta.get("type")

                            if delta_type == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    ttft = None
                                    if first_token:
                                        ttft = (time.perf_counter() - t0) * 1000
                                        first_token = False
                                    yield ChunkEvent(type="content", content=text, ttft_ms=ttft)

                            elif delta_type == "thinking_delta":
                                thinking = delta.get("thinking", "")
                                if thinking:
                                    yield ChunkEvent(type="thinking", content=thinking)

                        elif event_type == "message_delta":
                            # usage 在这里
                            usage = event.get("usage", {})
                            if usage:
                                total_ms = (time.perf_counter() - t0) * 1000
                                usage_info = self._parse_usage(usage)
                                out_tokens = usage_info.get("output_tokens") or 0
                                tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None
                                yield ChunkEvent(
                                    type="done",
                                    usage={**usage_info, "tokens_per_second": tps},
                                    total_ms=total_ms,
                                )

                        elif event_type == "message_stop":
                            break

            except Exception as e:
                yield ChunkEvent(type="error", error=str(e))
