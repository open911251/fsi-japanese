"""FSI 日語訓練工具的本地 AI server：Whisper STT ＋ Ollama 反向代理（補 CORS）。
只綁 127.0.0.1:8788，透過 ssh -L 使用；共用的 Ollama 設定完全不動。
環境變數：FSI_STT_MODEL（預設 small）、FSI_STT_DEVICE（auto/cpu）、FSI_OLLAMA。
"""
import io
import os

import httpx
import numpy as np
from fastapi import FastAPI, File, Form, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("FSI_STT_MODEL", "small")
OLLAMA = os.environ.get("FSI_OLLAMA", "http://127.0.0.1:11434")


def load_model():
    if os.environ.get("FSI_STT_DEVICE", "auto") != "cpu":
        try:
            m = WhisperModel(MODEL_NAME, device="cuda", compute_type="float16")
            segs, _ = m.transcribe(np.zeros(8000, dtype=np.float32), language="ja")
            list(segs)  # transcribe 是惰性 generator，必須消費才會真的觸發 GPU kernel
            print("STT device: cuda")
            return m, "cuda"
        except Exception as e:
            print("CUDA 不可用，改用 CPU：", e)
    m = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
    print("STT device: cpu")
    return m, "cpu"


model, device = load_model()
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"stt_model": MODEL_NAME, "device": device}


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    language: str = Form("ja"),
    response_format: str = Form("json"),
):
    data = await file.read()
    segs, _ = model.transcribe(io.BytesIO(data), language=language or "ja", beam_size=5, vad_filter=True)
    return {"text": "".join(s.text for s in segs).strip()}


@app.post("/v1/chat/completions")
async def chat(request: Request):
    body = await request.body()
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(OLLAMA + "/v1/chat/completions", content=body, headers={"content-type": "application/json"})
    return Response(content=r.content, status_code=r.status_code, media_type="application/json")


@app.get("/v1/models")
async def models():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(OLLAMA + "/v1/models")
    return Response(content=r.content, status_code=r.status_code, media_type="application/json")
