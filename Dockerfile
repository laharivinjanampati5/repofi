# Build stage - Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy frontend files
COPY package.json bun.lockb tsconfig*.json vite.config.ts tailwind.config.ts postcss.config.js eslint.config.js ./
COPY src ./src
COPY public ./public
COPY index.html ./

# Install and build frontend
RUN npm ci --prefer-offline --no-audit
RUN npm run build

# Runtime stage - Full stack (Backend + Frontend static files)
FROM python:3.11-slim

WORKDIR /app

# Copy Python dependencies
COPY backend/requirements_api.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend ./backend

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Expose port (Railway auto-detects PORT env var)
EXPOSE 8000

# Start backend API server
CMD ["uvicorn", "backend.api_server:app", "--host", "0.0.0.0", "--port", "8000"]
