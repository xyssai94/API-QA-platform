from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routers import endpoints, run, test_cases, compare, perf, history, batch, presets

app = FastAPI(title="模型测试平台", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api")
app.include_router(run.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(perf.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(batch.router, prefix="/api")
app.include_router(presets.router, prefix="/api")
app.include_router(test_cases.router, prefix="/api")


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
