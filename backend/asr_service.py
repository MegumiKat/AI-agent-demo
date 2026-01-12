# demo/backend/asr_service.py

"""
封装 SenseVoice ASR 模型的加载和识别接口。
FastAPI 只需要调用 transcribe_file(...)，不关心底层细节。
"""

from typing import Dict, Any

from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

from config import DEVICE, MODEL_DIR

print(f"[SenseVoice] 使用设备: {DEVICE}")
print(f"[SenseVoice] 使用模型: {MODEL_DIR}")

# ===== 1. 全局加载模型 =====

try:
  asr_model = AutoModel(
    model=MODEL_DIR,
    trust_remote_code=True,
    remote_code="./model.py",  # 使用仓库里的 model.py
    vad_model="fsmn-vad",
    vad_kwargs={"max_single_segment_time": 30000},
    device=DEVICE,
  )
  print("[SenseVoice] 模型加载成功")
except Exception as e:
  print(f"[SenseVoice] 模型加载失败: {e}")
  # 直接抛出，启动时就能发现问题，而不是运行时才炸
  raise


# ===== 2. 对外暴露一个简洁的识别函数 =====

def transcribe_file(
  file_path: str,
  language: str = "auto",
  use_itn: bool = True,
) -> str:
  """
  对给定音频文件路径进行识别，返回文本。
  - file_path: 音频文件路径
  - language: 识别语言模式
  - use_itn: 是否进行文本正规化+标点
  """
  # 这里可以根据需要扩展参数（batch_size_s, merge_length_s 等）
  res = asr_model.generate(
    input=file_path,
    cache={},
    language=language,
    use_itn=use_itn,
    batch_size_s=60,
    merge_vad=True,
    merge_length_s=15,
  )

  # 按 SenseVoice 输出结构取 text 字段
  raw_text = res[0].get("text", "") if res else ""
  text = rich_transcription_postprocess(raw_text)

  return text