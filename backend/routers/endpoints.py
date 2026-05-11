import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.endpoint import Endpoint
from schemas.endpoint import EndpointCreate, EndpointUpdate, EndpointOut

router = APIRouter(prefix="/endpoints", tags=["endpoints"])


def _serialize(ep: Endpoint) -> dict:
    d = {c.name: getattr(ep, c.name) for c in ep.__table__.columns}
    if d.get("extra_headers") and isinstance(d["extra_headers"], str):
        d["extra_headers"] = json.loads(d["extra_headers"])
    return d


@router.get("/", response_model=list[EndpointOut])
def list_endpoints(db: Session = Depends(get_db)):
    return [EndpointOut(**_serialize(ep)) for ep in db.query(Endpoint).all()]


@router.post("/", response_model=EndpointOut, status_code=201)
def create_endpoint(body: EndpointCreate, db: Session = Depends(get_db)):
    ep = Endpoint(
        name=body.name,
        protocol=body.protocol,
        base_url=body.base_url,
        api_key=body.api_key,
        extra_headers=json.dumps(body.extra_headers) if body.extra_headers else None,
        proxy=body.proxy,
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)
    return EndpointOut(**_serialize(ep))


@router.get("/{ep_id}", response_model=EndpointOut)
def get_endpoint(ep_id: int, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, ep_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return EndpointOut(**_serialize(ep))


@router.patch("/{ep_id}", response_model=EndpointOut)
def update_endpoint(ep_id: int, body: EndpointUpdate, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, ep_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    data = body.model_dump(exclude_unset=True)
    if "extra_headers" in data:
        data["extra_headers"] = json.dumps(data["extra_headers"]) if data["extra_headers"] else None
    for k, v in data.items():
        setattr(ep, k, v)
    db.commit()
    db.refresh(ep)
    return EndpointOut(**_serialize(ep))


@router.delete("/{ep_id}", status_code=204)
def delete_endpoint(ep_id: int, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, ep_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    db.delete(ep)
    db.commit()


@router.get("/{ep_id}/models")
async def list_models(ep_id: int, db: Session = Depends(get_db)):
    ep = db.get(Endpoint, ep_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    headers = {"Content-Type": "application/json"}
    if ep.api_key:
        headers["Authorization"] = f"Bearer {ep.api_key}"
    if ep.extra_headers:
        try:
            headers.update(json.loads(ep.extra_headers))
        except Exception:
            pass

    url = ep.base_url.rstrip("/") + "/models"
    proxies = {"all://": ep.proxy} if ep.proxy else None
    try:
        async with httpx.AsyncClient(proxies=proxies, timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            models = [m["id"] for m in data.get("data", []) if "id" in m]
            return {"models": models}
    except Exception:
        return {"models": []}
