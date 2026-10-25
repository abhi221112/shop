# Single-service image for Render: builds the website and serves it from the FastAPI app.
# (docker compose still uses backend/Dockerfile + frontend/Dockerfile.)
FROM node:22-alpine AS web
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=web /app/dist ./static
RUN useradd --create-home shop && mkdir -p /srv/uploads && chown shop /srv/uploads
USER shop

ENV UPLOAD_DIR=/srv/uploads STATIC_DIR=/srv/static PORT=8000
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"
