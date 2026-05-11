from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class EndpointCreate(BaseModel):
    name: str
    protocol: str
    base_url: str
    api_key: Optional[str] = None
    extra_headers: Optional[dict] = None
    proxy: Optional[str] = None


class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    protocol: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    extra_headers: Optional[dict] = None
    proxy: Optional[str] = None


class EndpointOut(BaseModel):
    id: int
    name: str
    protocol: str
    base_url: str
    api_key: Optional[str] = None
    extra_headers: Optional[dict] = None
    proxy: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
