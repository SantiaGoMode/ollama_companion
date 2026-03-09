#!/bin/bash

# Start AI Agent Hub - Backend & Frontend

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting AI Agent Hub..."
echo ""

# Start backend
echo "[Backend] Starting FastAPI on port 8000..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend
echo "[Frontend] Starting Vite dev server on port 5173..."
cd "$SCRIPT_DIR/frontend"
npx vite --host &
FRONTEND_PID=$!

echo ""
echo "Agent Hub is running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both services."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
