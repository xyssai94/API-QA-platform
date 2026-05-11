from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TestCaseCreate(BaseModel):
    group_name: Optional[str] = None
    tags: Optional[list[str]] = None
    name: str
    messages: list[dict]
    attachments: Optional[dict] = None
    expected: Optional[str] = None


class TestCaseUpdate(BaseModel):
    group_name: Optional[str] = None
    tags: Optional[list[str]] = None
    name: Optional[str] = None
    messages: Optional[list[dict]] = None
    attachments: Optional[dict] = None
    expected: Optional[str] = None


class TestCaseOut(BaseModel):
    id: int
    group_name: Optional[str] = None
    tags: Optional[list[str]] = None
    name: str
    messages: list[dict]
    attachments: Optional[dict] = None
    expected: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
