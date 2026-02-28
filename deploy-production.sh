#!/bin/bash
# CITARION v1.3.0 - Production Deployment Script
# 
# This script automates the production deployment process
# Run with: bash deploy-production.sh
#
# IMPORTANT: Review all steps before running in production!

set -e  # Exit on error

# ==================== CONFIGURATION ====================

APP_NAME="citarion"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="./logs/deploy-${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==================== HELPER FUNCTIONS ====================

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

success() {
    log "${GREEN}✓ $1${NC}"
}

error() {
    log "${RED}✗ $1${NC}"
    exit 1
}

warning() {
    log "${YELLOW}⚠ $1${NC}"
}

info() {
    log "  $1"
}

# ==================== PRE-DEPLOYMENT CHECKS ====================

pre_deployment_checks() {
    log "Starting pre-deployment checks..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js 18+ required (found: $(node -v))"
    fi
    success "Node.js version: $(node -v)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
    fi
    success "npm version: $(npm -v)"
    
    # Check .env file
    if [ ! -f ".env.production" ]; then
        warning ".env.production not found"
        info "Creating from .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env.production
            info "Please edit .env.production and set ENCRYPTION_KEY"
            exit 1
        else
            error "Neither .env.production nor .env.example found"
        fi
    fi
    
    # Check ENCRYPTION_KEY
    if ! grep -q "ENCRYPTION_KEY=" .env.production; then
        error "ENCRYPTION_KEY not set in .env.production"
    fi
    
    ENCRYPTION_KEY=$(grep "ENCRYPTION_KEY=" .env.production | cut -d'=' -f2)
    if [ ${#ENCRYPTION_KEY} -ne 64 ]; then
        error "ENCRYPTION_KEY must be 64 characters (32 bytes hex)"
    fi
    success "ENCRYPTION_KEY configured"
    
    # Check database
    if [ ! -f "prisma/dev.db" ] && [ -z "$DATABASE_URL" ]; then
        warning "Database not found. Will be created during migration."
    else
        success "Database found"
    fi
    
    # Check disk space
    AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
    info "Available disk space: $AVAILABLE_SPACE"
    
    success "All pre-deployment checks passed"
}

# ==================== BACKUP ====================

create_backup() {
    log "Creating backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    if [ -f "prisma/dev.db" ]; then
        cp "prisma/dev.db" "$BACKUP_DIR/dev.db.backup.$TIMESTAMP"
        success "Database backed up"
    fi
    
    # Backup .env
    if [ -f ".env.production" ]; then
        cp ".env.production" "$BACKUP_DIR/env.production.backup.$TIMESTAMP"
        success "Environment backed up"
    fi
    
    # Backup current build
    if [ -d ".next" ]; then
        tar -czf "$BACKUP_DIR/build.backup.$TIMESTAMP.tar.gz" .next
        success "Build backed up"
    fi
    
    info "Backup location: $BACKUP_DIR"
}

# ==================== INSTALLATION ====================

install_dependencies() {
    log "Installing dependencies..."
    
    # Clean install
    if [ -d "node_modules" ]; then
        info "Removing old node_modules..."
        rm -rf node_modules
    fi
    
    if [ -f "package-lock.json" ]; then
        rm package-lock.json
    fi
    
    # Install
    npm install --production
    success "Dependencies installed"
}

# ==================== DATABASE ====================

setup_database() {
    log "Setting up database..."
    
    # Generate Prisma client
    npx prisma generate
    success "Prisma client generated"
    
    # Push schema
    npx prisma db push
    success "Database schema updated"
}

# ==================== MIGRATION ====================

run_migration() {
    log "Running encryption migration..."
    
    # Dry run first
    info "Running dry-run..."
    npx ts-node scripts/migrate-encryption.ts --dry-run --verbose || true
    
    # Ask for confirmation
    echo ""
    warning "Ready to run migration. This will encrypt all API keys."
    read -p "Continue? (yes/no): " -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        warning "Migration cancelled by user"
        return 1
    fi
    
    # Run migration
    npx ts-node scripts/migrate-encryption.ts --yes
    success "Migration completed"
    
    # Verify
    info "Verifying migration..."
    npx ts-node scripts/migrate-encryption.ts --dry-run --verbose || true
    success "Migration verified"
}

# ==================== BUILD ====================

build_application() {
    log "Building application..."
    
    npm run build
    success "Build completed"
}

# ==================== START ====================

start_application() {
    log "Starting application..."
    
    # Check if PM2 is available
    if command -v pm2 &> /dev/null; then
        info "Starting with PM2..."
        pm2 start npm --name "$APP_NAME" -- start
        pm2 save
        success "Application started with PM2"
    else
        warning "PM2 not found. Start manually with: npm start"
        info "To install PM2: npm install -g pm2"
    fi
}

# ==================== HEALTH CHECK ====================

health_check() {
    log "Running health checks..."
    
    # Wait for application to start
    info "Waiting for application to start..."
    sleep 5
    
    # Check if process is running
    if command -v pm2 &> /dev/null; then
        if pm2 list | grep -q "$APP_NAME"; then
            success "Application is running"
        else
            error "Application failed to start"
        fi
    fi
    
    # Check health endpoint (if available)
    if command -v curl &> /dev/null; then
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            success "Health endpoint responding"
        else
            warning "Health endpoint not responding (may be normal)"
        fi
    fi
    
    success "Health checks completed"
}

# ==================== POST-DEPLOYMENT ====================

post_deployment() {
    log "Post-deployment tasks..."
    
    # Show summary
    echo ""
    echo "=========================================="
    success "DEPLOYMENT COMPLETED SUCCESSFULLY"
    echo "=========================================="
    echo ""
    info "Application: $APP_NAME"
    info "Version: 1.3.0"
    info "Timestamp: $TIMESTAMP"
    info "Backup: $BACKUP_DIR"
    info "Logs: $LOG_FILE"
    echo ""
    info "Next steps:"
    info "1. Test exchange connections in Settings"
    info "2. Monitor logs: tail -f $LOG_FILE"
    info "3. Check health: curl http://localhost:3000/api/health"
    info "4. Monitor for 24 hours"
    echo ""
    
    if command -v pm2 &> /dev/null; then
        info "PM2 commands:"
        info "  pm2 logs $APP_NAME     # View logs"
        info "  pm2 restart $APP_NAME  # Restart"
        info "  pm2 stop $APP_NAME     # Stop"
        info "  pm2 delete $APP_NAME   # Delete"
    fi
    
    echo ""
    success "Deployment complete! Visit http://localhost:3000"
}

# ==================== MAIN ====================

main() {
    echo ""
    echo "=========================================="
    echo "  CITARION v1.3.0 Production Deployment"
    echo "=========================================="
    echo ""
    
    # Create logs directory
    mkdir -p ./logs
    
    log "Deployment started"
    
    # Run all steps
    pre_deployment_checks
    create_backup
    install_dependencies
    setup_database
    run_migration || exit 1
    build_application
    start_application
    health_check
    post_deployment
    
    log "Deployment finished successfully"
}

# Run main function
main "$@"
