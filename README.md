# DiktoMed

Surgeons' dictations to medical documents, on the hospital's own server.

A dictation (dictaphone file or recorded in the browser) is transcribed by a
Latvian Whisper model running locally, the draft is checked for the places a
person must listen to, a transcriber corrects and approves it, and the approved
document is exported to Word. Nothing is sent to a cloud service.

The interface is in Latvian and follows the Shadowy platform design (tokens
and components), set in Poppins.

## How it works

```
dictaphone file / browser recording
  -> web (Next.js): upload, store on local disk, queue a job in Postgres
  -> worker (Python): ffmpeg to 16 kHz mono -> VAD -> Whisper (faster-whisper, local GPU/CPU)
  -> review flags: possible hallucinations, unclear lines and words, numbers and doses,
     operation side vs the planned side, words people corrected before, optional local-LLM hints
  -> review screen: waveform, click-to-listen words, edit fragments, accept or dismiss flags
  -> approval by a person -> DOCX export; every view, edit and export is in the audit log
  -> approved pairs (audio + text) -> export, evaluate and fine-tune the model on site
```

| Part | What | Where |
|---|---|---|
| `web/` | Next.js 14, Prisma, Postgres; UI, auth, audit, DOCX | `web/src` |
| `worker/` | Python; recognition, flags, retention | `worker/diktomed_worker` |
| `worker/training/` | dataset export, evaluation, fine-tuning | see `worker/training/README.md` |
| `docker-compose.yml` | db, migrate, web, worker; the worker has no internet | |

## Run it

### Demo without a GPU or a model

`ASR_BACKEND=fake` produces a fixed, fictional knee-arthroscopy dictation for any
uploaded audio, so the whole flow can be shown without real data.

```bash
cp .env.example .env    # set the secrets, and ASR_BACKEND=fake
docker compose up -d --build
# http://localhost:3000, log in with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

### Real recognition

1. On a machine with internet: `./worker/scripts/download_model.sh` (or `int8` for CPU).
   It converts the AiLab (LU MII) Latvian Whisper large-v3 to `./models/whisper-lv-ct2`.
2. Copy the project with `./models` to the hospital server.
3. `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build`

A single NVIDIA GPU with 8+ GB handles a regional hospital's volume; on CPU the
same works, several times slower.

### Development

```bash
# Postgres somewhere local, then:
cd web && npm install
export DATABASE_URL=postgresql://... STORAGE_DIR=../data
npx prisma migrate deploy && npm run db:seed   # admin@diktomed.local / diktomed-dev-parole
npm run dev

cd worker && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
DATABASE_URL=... STORAGE_DIR=../data ASR_BACKEND=fake .venv/bin/python -m diktomed_worker
```

Checks: `cd web && npm run typecheck && npm run lint && npm test`, `cd worker && pytest`.

## Data protection, in the code

- **Local only.** Audio, text and models stay on the server. The worker sits on
  an internal Docker network with no route out; models load offline; no
  telemetry, no fonts or scripts from the internet (strict CSP).
- **A person approves.** Flags and suggestions never change text by themselves.
  Approval is blocked while high-risk flags are open.
- **Never learned:** a change of operation side or of a number. Such a fix is
  about one patient; suggesting it next time would invite a wrong-site or
  wrong-dose error. Enforced in the web app and again in the worker.
- **Audit log** of logins, views, edits, approvals and exports, without the
  dictation text. Sessions last one shift (12 h).
- **Retention:** `RETENTION_DAYS` deletes approved audio after N days; the
  approved text stays. Agree the period with the hospital's DPO.
- **No patient data in logs.** The worker logs ids and counts only.

Before real patient data: DPIA with the hospital's data protection officer, TLS
in front of the web app (`COOKIE_SECURE=true`), disk encryption on the server,
backups of the `pgdata` and `audio` volumes, and a penetration test.

## Not yet

- Integration with the hospital information system (today: DOCX export).
- Speaker labels (surgeon / nurse) and structuring into protocol sections.
- Operation classification codes and summaries (needs a local LLM, see `LLM_BASE_URL`).
- Watching an input folder for dictaphone docking stations.
- SSO with the hospital directory instead of local accounts.

## Fonts

Poppins (interface and headings) and JetBrains Mono (timestamps), both under
the SIL Open Font License, self-hosted from `web/public/fonts`.
