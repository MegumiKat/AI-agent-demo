# demo/backend/config.py
"""
SenseVoice 后端配置集中管理：
- GPU / 设备选择
- 模型路径
- CORS 允许的前端地址
- API 端口
尽量都支持从环境变量覆盖，默认值对你现在的开发环境友好。
"""

import os
from typing import List


def _bool_env(name: str, default: bool) -> bool:
  """从环境变量读取布尔值，支持: 1/0, true/false, yes/no, on/off"""
  v = os.getenv(name)
  if v is None:
    return default
  return v.lower() in ("1", "true", "yes", "on")


# ===== 设备 / 模型配置 =====

# 是否使用 GPU（默认 False）
USE_GPU: bool = _bool_env("SENSEVOICE_USE_GPU", False)

# 使用哪块 GPU（多卡时可改，默认 0）
GPU_ID: int = int(os.getenv("SENSEVOICE_GPU_ID", "0"))

# 最终设备：优先从 SENSEVOICE_DEVICE 读取，其次按 USE_GPU/GPU_ID 推导
DEVICE: str = os.getenv(
  "SENSEVOICE_DEVICE",
  f"cuda:{GPU_ID}" if USE_GPU else "cpu",
)

# 模型目录（huggingface 名称或者本地路径）
MODEL_DIR: str = os.getenv("SENSEVOICE_MODEL_DIR", "iic/SenseVoiceSmall")


# ===== CORS / 前端访问配置 =====

# 默认允许的前端 host（可以通过 FRONTEND_HOSTS 覆盖，逗号分隔）
DEFAULT_FRONTEND_HOSTS = "localhost,127.0.0.1,192.168.8.210"

FRONTEND_HOSTS = os.getenv("FRONTEND_HOSTS", DEFAULT_FRONTEND_HOSTS).split(",")
FRONTEND_PORT = os.getenv("FRONTEND_PORT", "5173")


def build_cors_origins() -> List[str]:
  """根据 host + port 生成 http/https 的 CORS 列表"""
  origins: List[str] = []
  for host in FRONTEND_HOSTS:
    host = host.strip()
    if not host:
      continue
    origins.append(f"http://{host}:{FRONTEND_PORT}")
    origins.append(f"https://{host}:{FRONTEND_PORT}")
  return origins


CORS_ORIGINS: List[str] = build_cors_origins()


# ===== API 服务配置 =====

API_HOST: str = os.getenv("SENSEVOICE_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("SENSEVOICE_PORT", "8001"))
RELOAD: bool = _bool_env("SENSEVOICE_RELOAD", False)