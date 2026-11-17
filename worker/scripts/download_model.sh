#!/usr/bin/env bash
# Run ONCE on a machine WITH internet, then copy ./models to the hospital
# server. The worker itself never downloads anything (HF_HUB_OFFLINE=1).
#
#   ./scripts/download_model.sh            # AiLab (LU MII) Latvian Whisper large-v3
#   ./scripts/download_model.sh int8       # CPU-only server
#
# Model: https://huggingface.co/AiLab-IMCS-UL/whisper-large-v3-lv-late-cv19
# Check the model card's licence before use in production.
set -euo pipefail
quant="${1:-int8_float16}"
model="AiLab-IMCS-UL/whisper-large-v3-lv-late-cv19"
here="$(cd "$(dirname "$0")/../.." && pwd)"
dest="$here/models"

python3 -m venv /tmp/diktomed-convert
/tmp/diktomed-convert/bin/pip install -q "ctranslate2>=4.4" "transformers[torch]>=4.44" huggingface_hub

# Keep the Hugging Face copy too: fine-tuning starts from it.
/tmp/diktomed-convert/bin/huggingface-cli download "$model" --local-dir "$dest/hf/whisper-large-v3-lv-late-cv19"

# Some fine-tunes ship without tokenizer.json; take it from the base model.
if [ ! -f "$dest/hf/whisper-large-v3-lv-late-cv19/tokenizer.json" ]; then
  /tmp/diktomed-convert/bin/huggingface-cli download openai/whisper-large-v3 tokenizer.json preprocessor_config.json \
    --local-dir "$dest/hf/whisper-large-v3-lv-late-cv19"
fi

/tmp/diktomed-convert/bin/ct2-transformers-converter \
  --model "$dest/hf/whisper-large-v3-lv-late-cv19" --output_dir "$dest/whisper-lv-ct2" \
  --quantization "$quant" --copy_files tokenizer.json preprocessor_config.json --force

echo "Done: $dest/whisper-lv-ct2 (for the worker) and $dest/hf/ (for fine-tuning)."
