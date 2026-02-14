#!/bin/bash

# Travel Life Build Script
# This script builds production Docker images for the application

set -e  # Exit on error

VERSION=${1:-"latest"}
REGISTRY=${DOCKER_REGISTRY:-""}

echo "========================================="
echo "Travel Life Production Build"
echo "========================================="
echo "Version: $VERSION"
echo "Registry: ${REGISTRY:-"local"}"
echo ""

# Load environment variables if .env.production exists
if [ -f .env.production ]; then
    echo "Loading .env.production..."
    export $(grep -v '^#' .env.production | xargs)
fi

# Build backend
echo "Building backend image..."
docker build \
    -f backend/Dockerfile.prod \
    -t ${REGISTRY}travel-life-backend:${VERSION} \
    -t ${REGISTRY}travel-life-backend:latest \
    ./backend

echo "✓ Backend image built successfully"

# Build frontend
echo ""
echo "Building frontend image..."
docker build \
    -f frontend/Dockerfile.prod \
    --build-arg VITE_API_URL="${VITE_API_URL:-http://localhost:5000/api}" \
    --build-arg VITE_UPLOAD_URL="${VITE_UPLOAD_URL:-http://localhost:5000/uploads}" \
    -t ${REGISTRY}travel-life-frontend:${VERSION} \
    -t ${REGISTRY}travel-life-frontend:latest \
    ./frontend

echo "✓ Frontend image built successfully"

echo ""
echo "========================================="
echo "Build Complete!"
echo "========================================="
echo "Images created:"
echo "  - ${REGISTRY}travel-life-backend:${VERSION}"
echo "  - ${REGISTRY}travel-life-backend:latest"
echo "  - ${REGISTRY}travel-life-frontend:${VERSION}"
echo "  - ${REGISTRY}travel-life-frontend:latest"
echo ""
echo "To start the application:"
echo "  docker-compose -f docker-compose.prod.yml --env-file .env.production up -d"
echo ""
