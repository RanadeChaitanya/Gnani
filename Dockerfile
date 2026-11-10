# Stage 1: build the PWA
FROM node:22-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx tsc -b && npx vite build --outDir /out

# Stage 2: backend serving the PWA from one origin
FROM python:3.11-slim
WORKDIR /app/backend
COPY backend/pyproject.toml ./
COPY backend/app ./app
COPY --from=web /out ./app/static
RUN pip install --no-cache-dir -e .
ENV DATABASE_URL=sqlite:////data/saar.db PORT=8000
# hosts without a mounted volume (e.g. Render free) still need writable data folders
RUN mkdir -p /data /app/data
VOLUME /data
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health')"
# one worker: the room hub is in memory
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
