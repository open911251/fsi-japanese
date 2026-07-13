#!/bin/bash
# FSI 本地 AI server 啟動腳本：只綁 127.0.0.1:8788
# 用法：~/fsi-ai/start.sh，或 tmux new -d -s fsi ~/fsi-ai/start.sh
cd "$(dirname "$0")"
export FSI_STT_MODEL="${FSI_STT_MODEL:-large-v3-turbo}"
# 讓 CTranslate2 找到 pip 裝的 cuBLAS/cuDNN（GPU 失敗會自動退回 CPU，無害）
NV="$PWD/venv/lib/python3.12/site-packages/nvidia"
export LD_LIBRARY_PATH="$NV/cublas/lib:$NV/cudnn/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec venv/bin/uvicorn server:app --host 127.0.0.1 --port 8788
