# demo/backend/sensevoice_api.py

import os
import tempfile
import uvicorn
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS, API_HOST, API_PORT, RELOAD
from asr_service import transcribe_file


# ========= 1. 创建 FastAPI 应用 =========

app = FastAPI()

# CORS 设置：允许前端（Vite）访问
app.add_middleware(
  CORSMiddleware,
  allow_origins=CORS_ORIGINS,
  allow_credentials=False,
  allow_methods=["*"],
  allow_headers=["*"],
)


# ========= 2. 定义 /asr 接口 =========
@app.post("/asr")
async def asr_endpoint(
  audio: UploadFile = File(...),
  language: str = "auto",   # "zh", "en", "yue", "ja", "ko", "nospeech" 或 "auto"
  use_itn: bool = True,     # 是否进行文本正规化+标点
):
  """
  前端: FormData 里放一个字段 audio (Blob)
  返回: { "text": "识别结果" }
  """
  tmp_path: str | None = None

  try:
    # 1. 把上传的音频保存到临时文件
    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
      content = await audio.read()
      tmp.write(content)
      tmp_path = tmp.name

    # 2. 调用 ASR service 进行识别
    text = transcribe_file(
      file_path=tmp_path,
      language=language,
      use_itn=use_itn,
    )

    return JSONResponse({"text": text})

  except Exception as e:
    # 统一错误返回形式
    return JSONResponse({"error": str(e)}, status_code=500)

  finally:
    # 3. 确保删除临时文件
    if tmp_path and os.path.exists(tmp_path):
      try:
        os.remove(tmp_path)
      except OSError as e:
        print(f"删除临时文件失败 {tmp_path}: {e}")


@app.get("/health")
def health():
  return {"ok": True}


if __name__ == "__main__":
  uvicorn.run(
    "sensevoice_api:app",
    host=API_HOST,
    port=API_PORT,
    reload=RELOAD,
  )