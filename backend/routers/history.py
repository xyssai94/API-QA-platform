import csv
import io
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel
from database import get_db
from models.test_session import TestSession
from models.test_result import TestResult
from models.test_case import TestCase

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/")
def list_sessions(
    skip: int = 0,
    limit: int = 50,
    type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(TestSession)
    if type:
        query = query.filter(TestSession.type == type)
    if status:
        query = query.filter(TestSession.status == status)

    total = query.count()
    sessions = query.order_by(TestSession.id.desc()).offset(skip).limit(limit).all()

    items = []
    for s in sessions:
        count = (
            db.query(func.count(TestResult.id))
            .filter(TestResult.session_id == s.id)
            .scalar()
        )
        items.append({
            "id": s.id,
            "type": s.type,
            "name": s.name,
            "status": s.status,
            "result_count": count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return {"total": total, "items": items}


@router.get("/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.get(TestSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = (
        db.query(TestResult)
        .filter(TestResult.session_id == session_id)
        .order_by(TestResult.id)
        .all()
    )
    return {
        "id": session.id,
        "type": session.type,
        "name": session.name,
        "status": session.status,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "results": [
            {
                "id": r.id,
                "test_case_id": r.test_case_id,
                "test_case_name": (
                    db.get(TestCase, r.test_case_id).name
                    if r.test_case_id and db.get(TestCase, r.test_case_id) else None
                ),
                "request_snapshot": json.loads(r.request_snapshot) if r.request_snapshot else {},
                "response_text": r.response_text,
                "ttft_ms": r.ttft_ms,
                "total_ms": r.total_ms,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cache_read_tokens": r.cache_read_tokens,
                "tokens_per_second": r.tokens_per_second,
                "score": r.score,
                "status": r.status,
                "error_msg": r.error_msg,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ],
    }


@router.get("/{session_id}/export.csv")
def export_csv(session_id: int, db: Session = Depends(get_db)):
    session = db.get(TestSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = (
        db.query(TestResult)
        .filter(TestResult.session_id == session_id)
        .order_by(TestResult.id)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "result_id", "model", "status",
        "ttft_ms", "total_ms", "tokens_per_second",
        "input_tokens", "output_tokens", "cache_read_tokens",
        "response_text", "error_msg", "created_at",
    ])
    for r in results:
        snapshot = json.loads(r.request_snapshot) if r.request_snapshot else {}
        writer.writerow([
            r.id,
            snapshot.get("model", ""),
            r.status,
            r.ttft_ms,
            r.total_ms,
            r.tokens_per_second,
            r.input_tokens,
            r.output_tokens,
            r.cache_read_tokens,
            (r.response_text or "").replace("\n", "\\n"),
            r.error_msg or "",
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    filename = f"session_{session_id}.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.get(TestSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.query(TestResult).filter(TestResult.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"ok": True}


class ScoreBody(BaseModel):
    score: int


@router.patch("/results/{result_id}/score")
def set_score(result_id: int, body: ScoreBody, db: Session = Depends(get_db)):
    r = db.get(TestResult, result_id)
    if not r:
        raise HTTPException(status_code=404, detail="Result not found")
    if not 1 <= body.score <= 5:
        raise HTTPException(status_code=400, detail="score 必须在 1-5 之间")
    r.score = body.score
    db.commit()
    return {"ok": True}
