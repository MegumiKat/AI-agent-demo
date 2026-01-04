# demo/backend/sensevoice_api.py

import os
import tempfile
import uvicorn
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

# ========= 1. 全局加载 SenseVoice 模型 =========
USE_GPU = False        # 想用 GPU 就改成 True
GPU_ID = 0             # 多卡的时候可以改成 1、2...

if USE_GPU:
    DEVICE = f"cuda:{GPU_ID}"
else:
    DEVICE = "cpu"

print(f"[SenseVoice] 使用设备: {DEVICE}")
# 从环境变量中读取设备，默认 cpu
# DEVICE = os.getenv("SENSEVOICE_DEVICE", "cpu")
MODEL_DIR = "iic/SenseVoiceSmall"  # 和 README 中一致

asr_model = AutoModel(
    model=MODEL_DIR,
    trust_remote_code=True,
    remote_code="./model.py",  # 使用仓库里的 model.py
    vad_model="fsmn-vad",
    vad_kwargs={"max_single_segment_time": 30000},
    device=DEVICE,
)

# ========= 2. 创建 FastAPI 应用 =========

app = FastAPI()

# 允许你的前端（Vite）访问，比如 5173 端口
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    # 你的局域网访问地址（把 192.168.1.10 换成你实际 IP）
    "http://192.168.8.210:5173",
    "https://192.168.8.210:5173",
]

app.add_middleware(
    CORSMiddleware,
    # allow_origins=origins,
    allow_origins=["*"],
    # allow_credentials=True,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========= 3. 定义 /asr 接口 =========

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
    try:
        # 1. 把上传的音频保存到临时文件
        suffix = Path(audio.filename).suffix or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        # 2. 调用 SenseVoice 进行识别（核心逻辑来自 README 示例）
        res = asr_model.generate(
            input=tmp_path,
            cache={},
            language=language,
            use_itn=use_itn,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        raw_text = res[0]["text"]
        text = rich_transcription_postprocess(raw_text)

        return JSONResponse({"text": text})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.get("/health")
def health():
    return {"ok": True}

if __name__ == "__main__":
    uvicorn.run(
        "sensevoice_api:app",
        host="0.0.0.0",   # 允许局域网其它设备访问
        port=8001,
        reload=False,     # 建议关闭：避免重复加载模型
    )