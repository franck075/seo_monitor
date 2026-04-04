import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.api.router import api_router

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

os.makedirs("/app/static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

@app.get("/health")
async def health():
    return {"status": "ok"}
