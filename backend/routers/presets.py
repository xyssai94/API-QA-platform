import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.preset import Preset
from schemas.preset import PresetCreate, PresetUpdate, PresetOut

router = APIRouter(prefix="/presets", tags=["presets"])


def _serialize(p: Preset) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "endpoint_id": p.endpoint_id,
        "model": p.model,
        "params": json.loads(p.params) if isinstance(p.params, str) else (p.params or {}),
        "system_prompt": p.system_prompt,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/", response_model=list[PresetOut])
def list_presets(db: Session = Depends(get_db)):
    return [PresetOut(**_serialize(p)) for p in db.query(Preset).order_by(Preset.id).all()]


@router.post("/", response_model=PresetOut, status_code=201)
def create_preset(body: PresetCreate, db: Session = Depends(get_db)):
    p = Preset(
        name=body.name,
        endpoint_id=body.endpoint_id,
        model=body.model,
        params=json.dumps(body.params, ensure_ascii=False),
        system_prompt=body.system_prompt,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return PresetOut(**_serialize(p))


@router.patch("/{preset_id}", response_model=PresetOut)
def update_preset(preset_id: int, body: PresetUpdate, db: Session = Depends(get_db)):
    p = db.get(Preset, preset_id)
    if not p:
        raise HTTPException(status_code=404, detail="Preset not found")
    data = body.model_dump(exclude_unset=True)
    if "params" in data:
        data["params"] = json.dumps(data["params"], ensure_ascii=False)
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return PresetOut(**_serialize(p))


@router.delete("/{preset_id}", status_code=204)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    p = db.get(Preset, preset_id)
    if not p:
        raise HTTPException(status_code=404, detail="Preset not found")
    db.delete(p)
    db.commit()
