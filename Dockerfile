# 前端构建阶段
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY frontend ./frontend
COPY static ./static
COPY templates ./templates
RUN npm run build:frontend


# 运行阶段
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    JAVJAEGER_CONFIG_PATH=/app/data/config.json \
    JAVJAEGER_ACTOR_IMAGE_DIR=/app/actor_images

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    intel-media-va-driver \
    mesa-va-drivers \
    pciutils \
    vainfo \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-builder /frontend/static/app.js /app/static/app.js
COPY --from=frontend-builder /frontend/static/app.css /app/static/app.css

RUN mkdir -p /app/data /app/actor_images

EXPOSE 5000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}"]

