#!/usr/bin/env bash
# Downloads the AiLab (LU MII) Latvian Whisper large-v3 and converts it for the
# worker. Runs inside a throwaway Python container, so it works the same on
# Windows, macOS and Linux. From the project folder:
#
#   docker run --rm -v "${PWD}/models:/models" -v "${PWD}/worker/scripts:/scripts" python:3.12-slim bash /scripts/prepare_model.sh
#
# Optional argument: quantization, int8 (CPU, default) or int8_float16 (NVIDIA GPU).
# Model card and licence: https://huggingface.co/AiLab-IMCS-UL/whisper-large-v3-lv-late-cv19
set -euo pipefail
QUANT="${1:-int8}"
SRC=/models/hf/whisper-large-v3-lv-late-cv19
OUT=/models/whisper-lv-ct2

echo "1/3 Installing conversion tools (CPU only, a few minutes)..."
pip install -q --root-user-action=ignore --index-url https://download.pytorch.org/whl/cpu torch
pip install -q --root-user-action=ignore "transformers>=4.44" "ctranslate2>=4.4" huggingface_hub

echo "2/3 Downloading the Latvian model (about 3 GB)..."
python - <<'PY'
from huggingface_hub import snapshot_download

snapshot_download("AiLab-IMCS-UL/whisper-large-v3-lv-late-cv19", local_dir="/models/hf/whisper-large-v3-lv-late-cv19")
# Some fine-tunes ship without these two files; take them from the base model.
snapshot_download(
    "openai/whisper-large-v3",
    local_dir="/models/hf/openai-whisper-large-v3",
    allow_patterns=["tokenizer.json", "preprocessor_config.json"],
)
PY
for f in tokenizer.json preprocessor_config.json; do
  [ -f "$SRC/$f" ] || cp "/models/hf/openai-whisper-large-v3/$f" "$SRC/$f"
done

echo "3/3 Converting for the worker ($QUANT)..."
ct2-transformers-converter --model "$SRC" --output_dir "$OUT" --quantization "$QUANT" \
  --copy_files tokenizer.json preprocessor_config.json --force

echo "Done: $OUT"
ls -la "$OUT"
