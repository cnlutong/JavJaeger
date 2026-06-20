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
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-builder /frontend/static/app.js /app/static/app.js

RUN mkdir -p /app/data

EXPOSE 5000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}"]

