#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  Agent Social Media Platform"
echo "  Architecture: Unified NestJS (Backend + React + WebRTC)"
echo "  Database: PostgreSQL + Adminer (Docker)"
echo "=========================================================="

echo "[1/3] Ensuring Docker services (PostgreSQL + Adminer) are running..."
docker compose up -d

echo "[2/3] Checking build status..."
if [ ! -d "frontend/dist" ] || [ ! -d "dist" ]; then
  echo "Building frontend and backend..."
  npm run build
else
  echo "Build artifacts present."
fi

echo "[3/3] Starting Unified NestJS Platform..."
echo ""
echo "=========================================================="
echo "  🚀 Platform live on: http://localhost:3000"
echo "  - Frontend App:      http://localhost:3000"
echo "  - Backend REST API:  http://localhost:3000/api"
echo "  - WebRTC Signaling:  ws://localhost:3000"
echo "  - Adminer DB GUI:    http://localhost:8080"
echo "=========================================================="
echo ""

npm run start:prod
