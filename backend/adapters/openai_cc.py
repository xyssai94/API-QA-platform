import time
import json
from typing import AsyncIterator, Optional
import httpx
from adapters.base import BaseAdapter, RunRequest, RunResult, ChunkEvent


class OpenAICCAdapter(BaseAdapter):

    def _build_request(self, req: RunRequest) -> tuple[str, dict, dict]:
        base = req.base_url.rstrip("/")
        url = f"{base}/chat/completions"

        messages = []
        if req.system_prompt:
            messages.append({"role": "system", "content": req.system_prompt})
        messages.extend(req.messages)

        body: dict = {"model": req.model, "messages": messages, **req.params}

        headers = {"Content-Type": "application/json"}
        if req.api_key:
            headers["Authorization"] = f"Bearer {req.api_key}"
        if req.extra_headers:
            headers.update(req.extra_headers)

        return url, headers, body

    def _client(self, req: RunRequest) -> httpx.AsyncClient:
        proxies = {"http://": req.proxy, "https://": req.proxy} if req.proxy else None
        return httpx.AsyncClient(timeout=120, proxy=req.proxy if req.proxy else None)

    def _parse_usage(self, usage: Optional[dict]) -> dict:
        if not usage:
            return {}
        result = {
            "input_tokens": usage.get("prompt_tokens"),
            "output_tokens": usage.get("completion_tokens"),
        }
        # prompt_tokens_details 里有缓存信息
        details = usage.get("prompt_tokens_details") or {}
        if details.get("cached_tokens"):
            result["cache_read_tokens"] = details["cached_tokens"]
        # completion_tokens_details 里有推理 token
        comp_details = usage.get("completion_tokens_details") or {}
        if comp_details.get("reasoning_tokens"):
            result["reasoning_tokens"] = comp_details["reasoning_tokens"]
        return result

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
        text = data["choices"][0]["message"]["content"] or ""
        usage_info = self._parse_usage(data.get("usage"))

        out_tokens = usage_info.get("output_tokens") or 0
        tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None

        return RunResult(
            response_text=text,
            total_ms=total_ms,
            tokens_per_second=tps,
            **usage_info,
        )

    async def stream(self, req: RunRequest) -> AsyncIterator[ChunkEvent]:
        url, headers, body = self._build_request(req)
        body["stream"] = True
        body["stream_options"] = {"include_usage": True}

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
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        choices = chunk.get("choices") or []
                        content = ""
                        if choices:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content") or ""

                        if content:
                            ttft = None
                            if first_token:
                                ttft = (time.perf_counter() - t0) * 1000
                                first_token = False
                            yield ChunkEvent(type="content", content=content, ttft_ms=ttft)

                        # 最后一个 chunk 含 usage
                        if chunk.get("usage"):
                            total_ms = (time.perf_counter() - t0) * 1000
                            usage_info = self._parse_usage(chunk["usage"])
                            out_tokens = usage_info.get("output_tokens") or 0
                            tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None
                            yield ChunkEvent(
                                type="done",
                                usage={**usage_info, "tokens_per_second": tps},
                                total_ms=total_ms,
                            )

            except Exception as e:
                yield ChunkEvent(type="error", error=str(e))
