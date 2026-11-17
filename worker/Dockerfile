# CPU image. For an NVIDIA GPU use Dockerfile.gpu (docker-compose.gpu.yml).
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY diktomed_worker ./diktomed_worker
COPY training ./training

RUN useradd --system --uid 10001 worker && mkdir -p /data /models && chown worker /data
USER worker

# Never reach the internet for models: they are mounted at /models.
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
CMD ["python", "-m", "diktomed_worker"]
