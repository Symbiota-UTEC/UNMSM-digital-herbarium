# backend/Dockerfile
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
ENV PYTHONPATH=/app

RUN chmod +x backend/entrypoint.sh
