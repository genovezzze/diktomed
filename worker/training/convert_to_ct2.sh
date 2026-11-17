#!/usr/bin/env bash
# Converts a Hugging Face Whisper model folder to CTranslate2 for the worker.
#   ./training/convert_to_ct2.sh <hf-model-dir-or-id> <output-dir> [quantization]
# Quantization int8_float16 suits a GPU; use int8 for CPU-only servers.
set -euo pipefail
src="${1:?hf model dir or hub id}"
out="${2:?output dir}"
quant="${3:-int8_float16}"

ct2-transformers-converter --model "$src" --output_dir "$out" --quantization "$quant" \
  --copy_files tokenizer.json preprocessor_config.json
echo "Converted to $out. Set ASR_MODEL=$out for the worker."
