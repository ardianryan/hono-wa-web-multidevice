#!/bin/bash

# HonoWA Easy Install Script
# Created with ❤️ by Antigravity

set -e

echo "----------------------------------------------------"
echo "🚀 HonoWA - Unofficial WhatsApp API & Dashboard"
echo "----------------------------------------------------"

# 1. Check for Docker
if ! [ -x "$(command -v docker)" ]; then
  echo "❌ Error: Docker is not installed. Please install Docker first." >&2
  exit 1
fi

# 2. Check for Docker Compose (plugin or standalone)
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif [ -x "$(command -v docker-compose)" ]; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Docker Compose is not installed." >&2
    exit 1
fi

echo "✅ Docker detected: $($DOCKER_COMPOSE version)"

# 3. Create required directories
echo "📁 Creating data directories and setting permissions..."
mkdir -p .wwebjs_auth .wwebjs_cache public/assets/uploads data
# Use current user ownership for local development, but ensure it's writable
chmod -R 777 .wwebjs_auth .wwebjs_cache public/assets/uploads data

# 4. Setup .env file
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📝 Creating .env from .env.example..."
        cp .env.example .env
        echo "✅ .env file created."
    else
        echo "⚠️  Warning: .env.example not found. Creating a minimal .env..."
        echo "PORT=4000" > .env
        echo "NODE_ENV=production" >> .env
        echo "DATABASE_URL=postgresql://honowa:honowa_secret@postgres:5432/honowa" >> .env
    fi
else
    echo "ℹ️  .env file already exists, skipping."
fi

# 5. Build/Pull and Run
echo "🐳 Starting services with Docker Compose..."
$DOCKER_COMPOSE up -d --build

echo "----------------------------------------------------"
echo "✅ HonoWA has been successfully installed and started!"
echo ""
echo "🔗 Access the dashboard at: http://localhost:4000/login"
echo "👤 Default Credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "📝 Tip: You can edit the .env file to add your AI API keys."
echo "----------------------------------------------------"
