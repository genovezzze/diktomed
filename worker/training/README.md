# Making the model better on the hospital's own dictations

Three levers, from cheapest to strongest. All run on the hospital server; the
data never leaves it.

## 1. Vocabulary (minutes)

Add terms on the **Vārdnīca** page. They go into Whisper's initial prompt and
help with procedure, instrument and drug names. Limited: the prompt holds about
200 tokens.

## 2. Learned corrections (automatic)

Every edit a reviewer saves is diffed word by word. Short replacements
("koagulātoru" -> "koagulatoru") are counted; after `CORRECTION_MIN_COUNT`
repeats they become suggestions on new dictations. A person accepts or rejects
each one. Changes of operation side and of numbers are never learned.

## 3. Fine-tuning (hours of GPU time, needs data)

Approved dictations are exactly what fine-tuning needs: audio plus the correct
text, cut by segment.

```bash
# inside the worker container (or a GPU machine on the hospital network)
pip install -r requirements-train.txt

python -m training.export_dataset --out /data/training          # clips + train/test.jsonl
python -m training.evaluate --manifest /data/training/test.jsonl \
    --models /models/whisper-lv-ct2                              # baseline WER, CER, term recall

python -m training.finetune_whisper --base /models/hf/whisper-large-v3-lv-late-cv19 \
    --train /data/training/train.jsonl --eval /data/training/test.jsonl \
    --out /models/hf/whisper-lv-hospital --lora
./training/convert_to_ct2.sh /models/hf/whisper-lv-hospital /models/whisper-lv-hospital-ct2

python -m training.evaluate --manifest /data/training/test.jsonl \
    --models /models/whisper-lv-ct2,/models/whisper-lv-hospital-ct2
```

Switch `ASR_MODEL` only if the new model is better on the test set, and keep
the old folder for rollback.

How much data: noticeable gains from roughly 10-20 hours of approved
dictations; below a few hours, stay with vocabulary and learned corrections.

Legal: training on recordings is a new purpose of processing patient data
(and doctors' voices). Cover it in the DPIA with the hospital before running
it, keep the exported clips on the server, and delete them after training.
