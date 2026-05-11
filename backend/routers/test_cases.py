import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.test_case import TestCase
from schemas.test_case import TestCaseCreate, TestCaseUpdate, TestCaseOut

router = APIRouter(prefix="/test-cases", tags=["test-cases"])


def _serialize(tc: TestCase) -> dict:
    d = {c.name: getattr(tc, c.name) for c in tc.__table__.columns}
    if d.get("tags") and isinstance(d["tags"], str):
        d["tags"] = json.loads(d["tags"])
    if d.get("messages") and isinstance(d["messages"], str):
        d["messages"] = json.loads(d["messages"])
    if d.get("attachments") and isinstance(d["attachments"], str):
        d["attachments"] = json.loads(d["attachments"])
    return d


@router.get("/export/json")
def export_test_cases(db: Session = Depends(get_db)):
    cases = [_serialize(tc) for tc in db.query(TestCase).order_by(TestCase.id).all()]
    return JSONResponse(
        content=cases,
        headers={"Content-Disposition": "attachment; filename=test_cases.json"},
    )


class BulkImportBody(BaseModel):
    cases: list[TestCaseCreate]
    skip_duplicates: bool = True


@router.post("/import/json", status_code=201)
def import_test_cases(body: BulkImportBody, db: Session = Depends(get_db)):
    existing_names: set[str] = set()
    if body.skip_duplicates:
        existing_names = {tc.name for tc in db.query(TestCase.name).all()}

    created = 0
    skipped = 0
    for item in body.cases:
        if body.skip_duplicates and item.name in existing_names:
            skipped += 1
            continue
        tc = TestCase(
            group_name=item.group_name,
            tags=json.dumps(item.tags, ensure_ascii=False) if item.tags else None,
            name=item.name,
            messages=json.dumps(item.messages, ensure_ascii=False),
            attachments=json.dumps(item.attachments, ensure_ascii=False) if item.attachments else None,
            expected=item.expected,
        )
        db.add(tc)
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped}


@router.get("/", response_model=list[TestCaseOut])
def list_test_cases(
    group: str | None = Query(None),
    tag: str | None = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(TestCase)
    if group:
        query = query.filter(TestCase.group_name == group)
    if tag:
        all_cases = [TestCaseOut(**_serialize(tc)) for tc in query.all()]
        return [tc for tc in all_cases if tc.tags and tag in tc.tags]
    return [TestCaseOut(**_serialize(tc)) for tc in query.all()]


@router.post("/", response_model=TestCaseOut, status_code=201)
def create_test_case(body: TestCaseCreate, db: Session = Depends(get_db)):
    tc = TestCase(
        group_name=body.group_name,
        tags=json.dumps(body.tags, ensure_ascii=False) if body.tags else None,
        name=body.name,
        messages=json.dumps(body.messages, ensure_ascii=False),
        attachments=json.dumps(body.attachments, ensure_ascii=False) if body.attachments else None,
        expected=body.expected,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return TestCaseOut(**_serialize(tc))


@router.get("/{tc_id}", response_model=TestCaseOut)
def get_test_case(tc_id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    return TestCaseOut(**_serialize(tc))


@router.patch("/{tc_id}", response_model=TestCaseOut)
def update_test_case(tc_id: int, body: TestCaseUpdate, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    data = body.model_dump(exclude_unset=True)
    if "tags" in data:
        data["tags"] = json.dumps(data["tags"], ensure_ascii=False) if data["tags"] else None
    if "messages" in data:
        data["messages"] = json.dumps(data["messages"], ensure_ascii=False)
    if "attachments" in data:
        data["attachments"] = json.dumps(data["attachments"], ensure_ascii=False) if data["attachments"] else None

    for k, v in data.items():
        setattr(tc, k, v)
    db.commit()
    db.refresh(tc)
    return TestCaseOut(**_serialize(tc))


@router.delete("/{tc_id}", status_code=204)
def delete_test_case(tc_id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, tc_id)
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    db.delete(tc)
    db.commit()
