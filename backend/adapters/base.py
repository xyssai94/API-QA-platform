from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional


@dataclass
class RunRequest:
    base_url: str
    api_key: Optional[str]
    model: str
    messages: list[dict]
    system_prompt: Optional[str] = None
    params: dict = field(default_factory=dict)
    extra_headers: Optional[dict] = None
    proxy: Optional[str] = None
    stream: bool = False


@dataclass
class ChunkEvent:
    type: str          # "content" | "thinking" | "done" | "error"
    content: str = ""
    usage: Optional[dict] = None
    ttft_ms: Optional[float] = None
    total_ms: Optional[float] = None
    error: Optional[str] = None


@dataclass
class RunResult:
    response_text: str = ""
    thinking_text: str = ""
    ttft_ms: Optional[float] = None
    total_ms: Optional[float] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cache_read_tokens: Optional[int] = None
    cache_write_tokens: Optional[int] = None
    reasoning_tokens: Optional[int] = None
    tokens_per_second: Optional[float] = None
    error: Optional[str] = None


class BaseAdapter(ABC):
    @abstractmethod
    async def run(self, req: RunRequest) -> RunResult:
        """非流式执行，返回完整结果"""

    @abstractmethod
    async def stream(self, req: RunRequest) -> AsyncIterator[ChunkEvent]:
        """流式执行，yield ChunkEvent"""
