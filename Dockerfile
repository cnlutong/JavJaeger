# 多阶段构建 - 构建阶段
FROM python:3.13-slim as builder

# 设置工作目录
WORKDIR /app

# 安装系统依赖（包括Git用于获取版本信息）
RUN apt-get update && apt-get install -y \
    gcc \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 复制requirements.txt并安装Python依赖到全局位置
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 运行阶段 - 最小化镜像
FROM python:3.13-slim

# 设置工作目录
WORKDIR /app

# 在运行阶段也安装Git（轻量级）
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 设置环境变量 - 优化性能
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 从构建阶段复制Python包
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 创建非root用户以提高安全性
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 创建必要的目录并设置权限
RUN mkdir -p /app/data /app/static/avatars /app/templates && \
    chown -R appuser:appuser /app

# 复制应用代码（包括.git目录以获取版本信息）
COPY --chown=appuser:appuser . /app/

# 设置执行权限
RUN chmod -R 755 /app/static

# 切换到非root用户
USER appuser

# 暴露端口
EXPOSE 8000

# 启动命令 - 生产环境优化
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--access-log"]