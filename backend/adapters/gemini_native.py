import time
import json
from typing import AsyncIterator, Optional
import httpx
from adapters.base import BaseAdapter, RunRequest, RunResult, ChunkEvent


class GeminiNativeAdapter(BaseAdapter):

    def _build_request(self, req: RunRequest, stream: bool = False) -> tuple[str, dict, dict]:
        base = req.base_url.rstrip("/")
        action = "streamGenerateContent" if stream else "generateContent"
        url = f"{base}/models/{req.model}:{action}"

        # 转换 messages 格式
        contents = []
        for msg in req.messages:
            contents.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [{"text": msg["content"]}]
            })

        body: dict = {"contents": contents}

        # systemInstruction
        if req.system_prompt:
            body["systemInstruction"] = {"parts": [{"text": req.system_prompt}]}

        # generationConfig
        gen_config = {}
        if "temperature" in req.params:
            gen_config["temperature"] = req.params["temperature"]
        if "max_tokens" in req.params:
            gen_config["maxOutputTokens"] = req.params["max_tokens"]
        if "top_p" in req.params:
            gen_config["topP"] = req.params["top_p"]
        if "top_k" in req.params:
            gen_config["topK"] = req.params["top_k"]
        if "stop" in req.params:
            gen_config["stopSequences"] = req.params["stop"]

        # thinkingConfig
        if "extra" in req.params:
            extra = req.params["extra"]
            if "thinking_budget" in extra or "thinking_level" in extra or "include_thoughts" in extra:
                thinking = {}
                if "thinking_budget" in extra:
                    thinking["thinkingBudget"] = extra["thinking_budget"]
                if "thinking_level" in extra:
                    thinking["thinkingLevel"] = extra["thinking_level"]
                if "include_thoughts" in extra:
                    thinking["includeThoughts"] = extra["include_thoughts"]
                gen_config["thinkingConfig"] = thinking

        if gen_config:
            body["generationConfig"] = gen_config

        # Gemini 支持双重鉴权
        headers = {"Content-Type": "application/json"}
        if req.api_key:
            headers["x-goog-api-key"] = req.api_key
        if req.extra_headers:
            headers.update(req.extra_headers)

        return url, headers, body

    def _client(self, req: RunRequest) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=120, proxy=req.proxy if req.proxy else None)

    def _parse_usage(self, usage_metadata: Optional[dict], usage: Optional[dict]) -> dict:
        # Gemini 有两个 usage 字段：usageMetadata 和 usage
        result = {}
        if usage_metadata:
            result["input_tokens"] = usage_metadata.get("promptTokenCount")
            result["output_tokens"] = usage_metadata.get("candidatesTokenCount")
            result["cache_read_tokens"] = usage_metadata.get("cachedContentTokenCount")
        if usage:
            # 有时候在 usage 里也有细分
            if "promptTokenCount" in usage:
                result["input_tokens"] = usage["promptTokenCount"]
            if "candidatesTokenCount" in usage:
                result["output_tokens"] = usage["candidatesTokenCount"]
            if "thinkingTokenCount" in usage:
                result["reasoning_tokens"] = usage["thinkingTokenCount"]
        return result

    async def run(self, req: RunRequest) -> RunResult:
        url, headers, body = self._build_request(req, stream=False)

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
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            for part in content.get("parts", []):
                if "text" in part:
                    text += part["text"]
                elif "thought" in part:
                    thinking += part["thought"]

        usage_info = self._parse_usage(data.get("usageMetadata"), data.get("usage"))
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
        url, headers, body = self._build_request(req, stream=True)

        t0 = time.perf_counter()
        first_token = True

        async with self._client(req) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        err = await resp.aread()
                        yield ChunkEvent(type="error", error=f"HTTP {resp.status_code}: {err.decode()}")
                        return

                    buffer = b""
                    async for chunk in resp.aiter_bytes():
                        buffer += chunk
                        # Gemini 流式是换行分隔的 JSON 对象
                        while b"\n" in buffer:
                            line, buffer = buffer.split(b"\n", 1)
                            line = line.strip()
                            if not line:
                                continue

                            try:
                                obj = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            candidates = obj.get("candidates", [])
                            if not candidates:
                                continue

                            content = candidates[0].get("content", {})
                            for part in content.get("parts", []):
                                if "text" in part:
                                    text = part["text"]
                                    if text:
                                        ttft = None
                                        if first_token:
                                            ttft = (time.perf_counter() - t0) * 1000
                                            first_token = False
                                        yield ChunkEvent(type="content", content=text, ttft_ms=ttft)

                                elif "thought" in part:
                                    thought = part["thought"]
                                    if thought:
                                        yield ChunkEvent(type="thinking", content=thought)

                            # usage 在最后一个 chunk
                            usage_metadata = obj.get("usageMetadata")
                            usage = obj.get("usage")
                            if usage_metadata or usage:
                                total_ms = (time.perf_counter() - t0) * 1000
                                usage_info = self._parse_usage(usage_metadata, usage)
                                out_tokens = usage_info.get("output_tokens") or 0
                                tps = out_tokens / (total_ms / 1000) if out_tokens and total_ms else None
                                yield ChunkEvent(
                                    type="done",
                                    usage={**usage_info, "tokens_per_second": tps},
                                    total_ms=total_ms,
                                )

            except Exception as e:
                yield ChunkEvent(type="error", error=str(e))
