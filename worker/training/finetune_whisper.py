"""Fine-tunes a Whisper model on the hospital's approved dictations.

Runs on the hospital's GPU server, offline, on the clips written by
export_dataset. Start from the AiLab (LU MII) Latvian Whisper, which already
knows Latvian; the hospital data teaches it the surgeons' vocabulary and voices.

    python -m training.finetune_whisper \\
        --base /models/hf/whisper-large-v3-lv-late-cv19 \\
        --train /data/training/train.jsonl --eval /data/training/test.jsonl \\
        --out /models/hf/whisper-lv-hospital --lora

Then convert for the worker and compare before switching:

    ./training/convert_to_ct2.sh /models/hf/whisper-lv-hospital /models/whisper-lv-hospital-ct2
    python -m training.evaluate --manifest /data/training/test.jsonl \\
        --models /models/whisper-lv-ct2,/models/whisper-lv-hospital-ct2

Memory: full fine-tuning of large-v3 needs ~40 GB of GPU memory; --lora with
gradient checkpointing fits in 24 GB. Hours of data matter more than epochs:
expect useful gains from roughly 10-20 hours of approved dictations.
"""

from __future__ import annotations

import argparse
import json
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        if w.getframerate() != 16_000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"{path}: expected 16 kHz mono 16-bit WAV")
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return data.astype(np.float32) / 32768.0


class ManifestDataset(torch.utils.data.Dataset):
    def __init__(self, manifest: Path, processor: WhisperProcessor):
        self.base = manifest.parent
        self.items = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.processor = processor

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int) -> dict:
        item = self.items[i]
        audio = read_wav(self.base / item["audio"])
        features = self.processor.feature_extractor(audio, sampling_rate=16_000).input_features[0]
        labels = self.processor.tokenizer(item["text"]).input_ids
        return {"input_features": features, "labels": labels}


@dataclass
class Collator:
    processor: WhisperProcessor
    decoder_start_token_id: int

    def __call__(self, features: list[dict]) -> dict:
        inputs = self.processor.feature_extractor.pad(
            [{"input_features": f["input_features"]} for f in features], return_tensors="pt"
        )
        labels_batch = self.processor.tokenizer.pad([{"input_ids": f["labels"]} for f in features], return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        # The model adds the start token itself; drop it if the tokenizer did too.
        if (labels[:, 0] == self.decoder_start_token_id).all().item():
            labels = labels[:, 1:]
        inputs["labels"] = labels
        return inputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="AiLab-IMCS-UL/whisper-large-v3-lv-late-cv19", help="local folder or hub id")
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--eval", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--grad-accum", type=int, default=2)
    parser.add_argument("--lora", action="store_true", help="train LoRA adapters only (24 GB GPU)")
    parser.add_argument("--freeze-encoder", action="store_true", help="train the decoder only")
    args = parser.parse_args()

    processor = WhisperProcessor.from_pretrained(args.base, language="latvian", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(args.base)
    model.generation_config.language = "latvian"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None
    model.config.use_cache = False

    if args.freeze_encoder:
        model.freeze_encoder()

    if args.lora:
        from peft import LoraConfig, get_peft_model  # noqa: PLC0415

        model = get_peft_model(
            model,
            LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "out_proj"]),
        )
        model.print_trainable_parameters()

    train = ManifestDataset(args.train, processor)
    evaluation = ManifestDataset(args.eval, processor) if args.eval else None
    cuda = torch.cuda.is_available()

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(args.out / "checkpoints"),
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr if not args.lora else args.lr * 10,
        warmup_ratio=0.1,
        num_train_epochs=args.epochs,
        gradient_checkpointing=True,
        fp16=cuda,
        eval_strategy="epoch" if evaluation else "no",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=bool(evaluation),
        metric_for_best_model="eval_loss" if evaluation else None,
        logging_steps=25,
        report_to=[],  # no telemetry, no external trackers
        remove_unused_columns=False,
        label_names=["labels"],
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train,
        eval_dataset=evaluation,
        data_collator=Collator(processor, model.config.decoder_start_token_id),
    )
    trainer.train()

    final = trainer.model
    if args.lora:
        final = final.merge_and_unload()
    args.out.mkdir(parents=True, exist_ok=True)
    final.save_pretrained(str(args.out))
    processor.save_pretrained(str(args.out))
    print(f"saved to {args.out}. Next: convert with training/convert_to_ct2.sh and compare with training.evaluate")


if __name__ == "__main__":
    main()
