#!/bin/bash
# CITARION Production Deployment Script
# Usage: ./deploy.sh

set -e

echo "============================================"
echo "  CITARION Production Deployment"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 not found. Please install it first."
        exit 1
    fi
}

# Check prerequisites
log_info "Checking prerequisites..."
check_command node
check_command npm
check_command docker
check_command docker-compose

echo ""
log_info "Node version: $(node --version)"
log_info "npm version: $(npm --version)"
log_info "Docker version: $(docker --version)"
echo ""

# Check .env.production
if [ ! -f .env.production ]; then
    log_warn ".env.production not found!"
    log_info "Creating from .env.example..."
    cp .env.example .env.production
    log_warn "Please edit .env.production with your production values!"
    exit 1
fi

# Load environment variables
set -a
source .env.production
set +a

# Create necessary directories
log_info "Creating directories..."
mkdir -p data logs backups/db grafana/provisioning prometheus nginx/ssl nginx/logs

# Build Docker images
log_info "Building Docker images..."
docker-compose build

# Start services
log_info "Starting services..."
docker-compose up -d

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 30

# Check service health
log_info "Checking service health..."
docker-compose ps

# Run database migrations
log_info "Running database migrations..."
docker-compose exec -T citarion npx prisma migrate deploy
docker-compose exec -T citarion npx prisma generate

# Check logs for errors
log_info "Checking logs..."
docker-compose logs --tail=50 citarion

# Test health endpoint
log_info "Testing health endpoint..."
sleep 5
curl -f http://localhost:3000/api/health || log_warn "Health check failed, but continuing..."

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
log_info "Application URL: http://localhost:3000"
log_info "Grafana URL: http://localhost:3001"
log_info "Prometheus URL: http://localhost:9090"
echo ""
log_info "To view logs: docker-compose logs -f citarion"
log_info "To stop: docker-compose down"
log_info "To restart: docker-compose restart"
echo ""

# Save deployment info
cat > deployment-info.txt << EOF
Deployment Date: $(date)
Version: 1.2.0
Services:
$(docker-compose ps)
EOF

log_info "Deployment info saved to deployment-info.txt"
