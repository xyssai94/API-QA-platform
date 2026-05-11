from pydantic import BaseModel
from typing import Optional


class PresetCreate(BaseModel):
    name: str
    endpoint_id: int
    model: str
    params: dict = {}
    system_prompt: Optional[str] = None


class PresetUpdate(BaseModel):
    name: Optional[str] = None
    endpoint_id: Optional[int] = None
    model: Optional[str] = None
    params: Optional[dict] = None
    system_prompt: Optional[str] = None


class PresetOut(BaseModel):
    id: int
    name: str
    endpoint_id: int
    model: str
    params: dict
    system_prompt: Optional[str] = None
    created_at: Optional[str] = None
