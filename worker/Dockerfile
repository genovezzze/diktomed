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

# Same UID as the web container's "node" user (1000): both read and write the
# shared audio volume, and the web app creates directories the worker must open.
RUN (getent passwd 1000 >/dev/null || useradd --uid 1000 --user-group --no-create-home --shell /usr/sbin/nologin diktomed) \
 && mkdir -p /data /models && chown 1000:1000 /data
USER 1000

# Never reach the internet for models: they are mounted at /models.
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
CMD ["python", "-m", "diktomed_worker"]
