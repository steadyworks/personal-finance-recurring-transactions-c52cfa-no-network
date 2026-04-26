#!/bin/bash
set -e

# Start PostgreSQL if not already running
pg_ctlcluster 16 main start 2>/dev/null || true

# Wait until postgres is ready
for i in {1..60}; do
  if pg_isready -U postgres > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "PostgreSQL is ready"

# Backend
cd /app/backend
pip install -r requirements.txt -q
python3 main.py &

# Wait for backend to come up
for i in {1..30}; do
  if curl -s http://localhost:3001/api/accounts > /dev/null 2>&1; then
    echo "Backend is ready"
    break
  fi
  sleep 1
done

# Frontend
cd /app/frontend
npm install
npm run build && npx vite preview --port 3000 --host 0.0.0.0 --strictPort &
