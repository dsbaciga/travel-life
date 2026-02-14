#!/bin/bash
# Test script to verify backend configuration in TrueNAS deployment

echo "========================================="
echo "Testing Backend Configuration"
echo "========================================="
echo ""

# Check if frontend container exists
if ! docker ps | grep -q travel-life-frontend; then
    echo "ERROR: Frontend container is not running"
    exit 1
fi

echo "✓ Frontend container is running"
echo ""

# Check environment variables
echo "Checking environment variables..."
BACKEND_HOST=$(docker exec travel-life-frontend env | grep BACKEND_HOST | cut -d'=' -f2)
BACKEND_PORT=$(docker exec travel-life-frontend env | grep BACKEND_PORT | cut -d'=' -f2)

echo "  BACKEND_HOST: ${BACKEND_HOST:-not set}"
echo "  BACKEND_PORT: ${BACKEND_PORT:-not set}"
echo ""

# Check nginx configuration
echo "Checking nginx configuration..."
if docker exec travel-life-frontend cat /etc/nginx/conf.d/default.conf | grep -q "proxy_pass"; then
    echo "✓ Nginx proxy configuration found"
    docker exec travel-life-frontend cat /etc/nginx/conf.d/default.conf | grep proxy_pass | head -2
else
    echo "ERROR: Nginx proxy configuration not found"
    exit 1
fi
echo ""

# Test backend connectivity from frontend
echo "Testing backend connectivity from frontend container..."
if docker exec travel-life-frontend wget -qO- http://${BACKEND_HOST}:${BACKEND_PORT}/health 2>/dev/null; then
    echo "✓ Backend is reachable from frontend"
else
    echo "ERROR: Cannot reach backend from frontend"
    echo "  Trying: http://${BACKEND_HOST}:${BACKEND_PORT}/health"
    exit 1
fi
echo ""

echo "========================================="
echo "All tests passed!"
echo "========================================="
