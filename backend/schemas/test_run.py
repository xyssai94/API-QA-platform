from pydantic import BaseModel
from typing import Optional


class RunParams(BaseModel):
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    stop: Optional[list[str]] = None
    extra: Optional[dict] = None        # 其他自定义字段，合并进请求体


class SingleRunRequest(BaseModel):
    endpoint_id: int
    model: str
    messages: list[dict]
    system_prompt: Optional[str] = None
    params: Optional[RunParams] = None
    stream: bool = False
