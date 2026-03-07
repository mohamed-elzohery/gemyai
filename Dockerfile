# ============================================================
# Stage 1: Build the Vite frontend
# ============================================================
FROM node:20-slim AS frontend-build

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

WORKDIR /build

# Copy workspace root configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy both package dirs (client + server package.json for workspace resolution)
COPY apps/client/ apps/client/
COPY apps/server/package.json apps/server/package.json

# Install all workspace deps
RUN pnpm install --frozen-lockfile

# Build arg for the Google OAuth client ID (needed at Vite build time)
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

# Build the client — output goes to apps/server/app/static/
RUN pnpm build --filter=@gemyai/client

# ============================================================
# Stage 2: Python runtime
# ============================================================
FROM python:3.12-slim AS runtime

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps (none needed for now, but keeps the layer for future use)
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy the server package and install Python dependencies
COPY apps/server/pyproject.toml /app/server/
COPY apps/server/app/ /app/server/app/

# Copy the built frontend from stage 1 into the server's static dir
COPY --from=frontend-build /build/apps/server/app/static/ /app/server/app/static/

# Install Python deps
RUN pip install --no-cache-dir /app/server

# Set working directory to the app module
WORKDIR /app/server/app

# Cloud Run injects PORT env var (default 8080)
ENV PORT=8080

# Run uvicorn — reads PORT from environment
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
