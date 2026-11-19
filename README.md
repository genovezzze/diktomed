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
  -> structured operation protocol from the APPROVED text: each section with exact quotes,
     numbers and side checked against the quotes and the planned side -> a person accepts
     every field -> protocol approved -> DOCX
  -> approved pairs (audio + text) -> export, evaluate and fine-tune the model on site
```

### Operation protocol

After the transcript is approved, the worker splits it into the sections of
the protocol form (`protocol_sections`: diagnosis, operation, anaesthesia,
course, findings, blood loss, drainage, complications, histology, orders).
Each field is a value plus the exact passages it rests on, and is checked:

| Check | Catches |
|---|---|
| quote must be in the approved text | an invented passage |
| every number in the value must be in its quotes (words and digits: "divdesmit" = 20) | a wrong dose or volume |
| the side in the value must match the quotes and the planned side | a wrong-site entry |

A field with a warning is shown in orange or red; approval is blocked until a
person has accepted, edited or rejected every filled field. With a local LLM
(`LLM_BASE_URL`, `LLM_MODEL`) the fields are drafted by the model; without one,
or if it is unreachable, keyword rules draft them (`PROTOCOL_BACKEND=rules`).

| Part | What | Where |
|---|---|---|
| `web/` | Next.js 14, Prisma, Postgres; UI, auth, audit, DOCX | `web/src` |
| `worker/` | Python; recognition, flags, retention | `worker/diktomed_worker` |
| `worker/training/` | dataset export, evaluation, fine-tuning | see `worker/training/README.md` |
| `docker-compose.yml` | db, migrate, web, worker; the worker has no internet | |
| `docs/IT-apraksts.md` | one-page technical description for the hospital's IT (Latvian) | |

## Run it

### On your own computer (Windows, macOS or Linux), demo mode

No GPU and no model needed: `ASR_BACKEND=fake` turns any uploaded audio into
the same fictional knee-arthroscopy dictation, so the whole flow can be shown
without real data.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Git.
2. In a terminal:
   ```bash
   git clone https://github.com/genovezzze/diktomed
   cd diktomed
   cp .env.example .env          # Windows PowerShell: copy .env.example .env
   ```
3. Open `.env` and set `POSTGRES_PASSWORD`, `SESSION_SECRET` (32+ characters),
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (12+ characters),
   `ASR_BACKEND=fake` and `DEMO_MODE=true` (demo text is fictional and is
   marked as such; without DEMO_MODE it cannot be approved).
4. `docker compose up -d --build` (the first build takes a few minutes).
5. Open http://localhost:3000 and log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
   Add colleagues under **Lietotāji**: each gets a temporary password and must
   choose their own at first login.

Stop with `docker compose down`; `docker compose down -v` also deletes the
data.

### Real recognition

1. On a machine with internet: `./worker/scripts/download_model.sh` (or `int8` for CPU).
   It converts the AiLab (LU MII) Latvian Whisper large-v3 to `./models/whisper-lv-ct2`.
2. `docker compose up -d --build`, or with an NVIDIA GPU
   `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build`.

### On the hospital server: offline bundle

The hospital gets one archive with prebuilt images, the model and scripts; the
server needs no internet. The step-by-step guide for the hospital's IT, in
Latvian, is [`docs/IT-uzstadisana.md`](docs/IT-uzstadisana.md).

```bash
deploy/make-bundle.sh              # dist/diktomed-<version>.tar (CPU worker, with the model)
deploy/make-bundle.sh --gpu        # NVIDIA worker
deploy/make-bundle.sh --no-model   # an update, when the model is unchanged
```

On the server: `tar -xf diktomed-<version>.tar && cd diktomed-<version> && sudo ./install.sh`.
It installs to `/opt/diktomed`, writes `.env` with random secrets, turns on
HTTPS with the hospital's certificate (`certs/cert.pem`, `certs/key.pem`,
Caddy in `docker-compose.tls.yml`), starts everything and schedules nightly
backups. The first administrator gets a temporary password that must be
changed at first login. Later: `sudo ./update.sh` from a new bundle (backs up
first), `backup.sh`, `restore.sh`.

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

Before real patient data: DPIA with the hospital's data protection officer,
HTTPS (the bundle's installer sets it up), disk encryption on the server,
backups kept off the server on encrypted storage, and a penetration test.

## Not yet

- Integration with the hospital information system (today: DOCX export).
- Speaker labels (surgeon / nurse), only needed if the hospital records the OR conversation.
- Operation classification codes: candidates from the official list, chosen by a person.
- An admin screen for the protocol sections (today: the `protocol_sections` table).
- Watching an input folder for dictaphone docking stations.
- Login with the hospital's Active Directory instead of local accounts.

## Fonts

Poppins (interface and headings) and JetBrains Mono (timestamps), both under
the SIL Open Font License, self-hosted from `web/public/fonts`.
