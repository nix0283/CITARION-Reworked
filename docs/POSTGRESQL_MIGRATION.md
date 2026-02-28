# 🗄️ PostgreSQL Migration Guide

**Version:** 2.0.0  
**Date:** 2025-01-22  
**Status:** ✅ PRODUCTION READY

---

## 📋 OVERVIEW

This guide walks you through migrating CITARION from SQLite to PostgreSQL for production deployment.

### Why PostgreSQL?

| Feature | SQLite | PostgreSQL | Benefit |
|---------|--------|------------|---------|
| Concurrent Connections | 1 | 1,000+ | 1000x scalability |
| Read Throughput | 1,000 QPS | 50,000 QPS | 50x faster |
| Write Throughput | 100 QPS | 10,000 QPS | 100x faster |
| Max Database Size | 14 TB | Unlimited | No limits |
| Replication | ❌ | ✅ | High availability |
| Backup/Recovery | Manual | Automated | Production-ready |
| Full-Text Search | Limited | Advanced | Better analytics |

---

## 🚀 QUICK START

### Option 1: Local PostgreSQL (Development)

```bash
# Windows - Install PostgreSQL
# Download: https://www.postgresql.org/download/windows/

# Linux - Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# macOS - Install PostgreSQL
brew install postgresql

# Start PostgreSQL service
# Windows: Run as service automatically
# Linux: sudo systemctl start postgresql
# macOS: brew services start postgresql

# Create database
psql -U postgres
CREATE DATABASE citarion;
CREATE USER citarion WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE citarion TO citarion;
\q

# Update .env
DATABASE_URL="postgresql://citarion:your_secure_password@localhost:5432/citarion"

# Run migrations
npx prisma migrate dev
npx prisma db push

# Verify
npx prisma studio
```

### Option 2: Docker PostgreSQL (Recommended for Testing)

```bash
# Start PostgreSQL container
docker run -d \
  --name citarion-postgres \
  -e POSTGRES_USER=citarion \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=citarion \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Update .env
DATABASE_URL="postgresql://citarion:your_secure_password@localhost:5432/citarion"

# Run migrations
npx prisma migrate dev

# Stop container
docker stop citarion-postgres

# Start container
docker start citarion-postgres
```

### Option 3: Cloud PostgreSQL (Production)

#### AWS RDS

```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier citarion-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15 \
  --master-username citarion \
  --master-user-password your_secure_password \
  --allocated-storage 100 \
  --storage-type gp3 \
  --backup-retention-period 7 \
  --multi-az \
  --publicly-accessible false

# Get endpoint
aws rds describe-db-instances \
  --db-instance-identifier citarion-prod \
  --query 'DBInstances[0].Endpoint.Address'

# Update .env.production
DATABASE_URL="postgresql://citarion:your_secure_password@citarion-prod.xxxxx.us-east-1.rds.amazonaws.com:5432/citarion"
```

#### Supabase (Free Tier)

```bash
# 1. Create project at https://supabase.com
# 2. Get connection string from Settings > Database
# 3. Update .env.production
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres"
```

#### Railway

```bash
# 1. Create project at https://railway.app
# 2. Add PostgreSQL plugin
# 3. Get connection string
# 4. Update .env.production
DATABASE_URL="postgresql://postgres:[PASSWORD]@xxxxx.railway.internal:5432/railway"
```

---

## 📝 STEP-BY-STEP MIGRATION

### Step 1: Backup Existing Data (SQLite)

```bash
# Navigate to project
cd C:\Users\CITARION

# Backup SQLite database
cp prisma/dev.db prisma/dev.db.backup

# Export data (optional)
npx prisma db pull --schema=prisma/schema.backup.prisma
```

### Step 2: Install PostgreSQL

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer
3. Set password for postgres user
4. Keep default port (5432)
5. Install pgAdmin (optional but recommended)

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Step 3: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE citarion;
CREATE USER citarion WITH PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE citarion TO citarion;

# Set schema permissions
\c citarion
GRANT ALL ON SCHEMA public TO citarion;
\q
```

### Step 4: Update Environment

```bash
# Copy template
cp .env.example .env.production

# Update DATABASE_URL
# BEFORE (SQLite):
DATABASE_URL="file:./prisma/dev.db"

# AFTER (PostgreSQL):
DATABASE_URL="postgresql://citarion:YOUR_SECURE_PASSWORD@localhost:5432/citarion"
```

### Step 5: Run Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name postgresql_migration

# Push schema (alternative)
npx prisma db push

# Verify
npx prisma studio
```

### Step 6: Seed Database (Optional)

```bash
# Create seed file
# prisma/seed.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Create default user
  await prisma.user.upsert({
    where: { email: 'admin@citarion.app' },
    update: {},
    create: {
      email: 'admin@citarion.app',
      name: 'Admin',
      currentMode: 'DEMO',
    },
  })
  
  console.log('Database seeded!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

# Run seed
npx prisma db seed
```

### Step 7: Test Connection

```bash
# Test database connection
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.user.count()
  .then(count => console.log('Users:', count))
  .catch(console.error)
  .finally(() => prisma.\$disconnect());
"

# Test API
curl http://localhost:3000/api/health
```

### Step 8: Deploy to Production

```bash
# Build application
npm run build

# Start with PM2
pm2 start npm --name "citarion" -- start

# Or use Docker
docker-compose up -d

# Verify deployment
curl https://your-domain.com/api/health
```

---

## 🔧 TROUBLESHOOTING

### Issue: Connection Refused

```bash
# Check if PostgreSQL is running
# Windows: Check Services
# Linux: sudo systemctl status postgresql

# Check port
netstat -an | grep 5432

# Update pg_hba.conf (Linux: /etc/postgresql/15/main/pg_hba.conf)
# Add:
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Issue: Authentication Failed

```bash
# Reset password
psql -U postgres
ALTER USER citarion WITH PASSWORD 'new_password';
\q

# Update .env
DATABASE_URL="postgresql://citarion:new_password@localhost:5432/citarion"
```

### Issue: Database Does Not Exist

```bash
# Create database
psql -U postgres
CREATE DATABASE citarion;
\q
```

### Issue: Permission Denied

```bash
# Grant permissions
psql -U postgres
GRANT ALL PRIVILEGES ON DATABASE citarion TO citarion;
\c citarion
GRANT ALL ON SCHEMA public TO citarion;
\q
```

### Issue: Prisma Migration Errors

```bash
# Reset database (DEVELOPMENT ONLY)
npx prisma migrate reset

# Clear migration lock
rm prisma/migrations/migration_lock.toml

# Re-run migrations
npx prisma migrate dev
```

---

## 📊 PERFORMANCE TUNING

### PostgreSQL Configuration

Edit `postgresql.conf`:

```conf
# Memory
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 1GB      # 75% of RAM
work_mem = 16MB                 # Per-operation memory
maintenance_work_mem = 128MB    # For VACUUM, CREATE INDEX

# Connections
max_connections = 200           # Adjust based on needs

# Write-Ahead Log
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planning
random_page_cost = 1.1          # For SSD
effective_io_concurrency = 200  # For SSD
```

### Indexes

Prisma automatically creates indexes for:
- Primary keys
- Unique constraints
- `@@index` declarations

Add custom indexes if needed:

```prisma
model Trade {
  id        String   @id @default(cuid())
  userId    String
  symbol    String
  createdAt DateTime @default(now())
  
  @@index([userId, createdAt])
  @@index([symbol, createdAt])
}
```

### Connection Pooling

For production, use connection pooling:

```bash
# Install PgBouncer
sudo apt-get install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
citarion = host=localhost port=5432 dbname=citarion

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20

# Update DATABASE_URL
DATABASE_URL="postgresql://citarion:password@localhost:6432/citarion"
```

---

## 🔒 SECURITY BEST PRACTICES

### 1. Use Strong Passwords

```bash
# Generate secure password
openssl rand -base64 32

# Use in DATABASE_URL
DATABASE_URL="postgresql://citarion:$(openssl rand -base64 32)@localhost:5432/citarion"
```

### 2. Restrict Network Access

```bash
# Only allow localhost (development)
# postgresql.conf:
listen_addresses = 'localhost'

# Or specific IPs (production)
listen_addresses = '192.168.1.100'
```

### 3. Enable SSL (Production)

```bash
# Generate SSL certificates
openssl req -new -text -passout pass:abcd -subj /CN=localhost -keyout server.key -out server.csr
openssl rsa -in server.key -passin pass:abcd -out server.key
openssl x509 -req -in server.csr -signkey server.key -out server.crt

# Configure PostgreSQL
# postgresql.conf:
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'

# Update DATABASE_URL
DATABASE_URL="postgresql://citarion:password@localhost:5432/citarion?sslmode=require"
```

### 4. Regular Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U citarion -h localhost citarion > backups/citarion_$DATE.sql

# Keep last 7 days
find backups -name "citarion_*.sql" -mtime +7 -delete

# Add to crontab
0 2 * * * /path/to/backup_script.sh
```

### 5. Monitor Database

```sql
-- Check connections
SELECT count(*) FROM pg_stat_activity;

-- Check database size
SELECT pg_size_pretty(pg_database_size('citarion'));

-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 📈 MONITORING

### Prometheus Metrics

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://citarion:password@postgres:5432/citarion?sslmode=disable"
    ports:
      - "9187:9187"
```

### Grafana Dashboard

Import PostgreSQL dashboard:
- Dashboard ID: 9628
- URL: https://grafana.com/grafana/dashboards/9628

### Key Metrics to Monitor

| Metric | Warning | Critical |
|--------|---------|----------|
| Connections | >80% max | >95% max |
| Disk Usage | >70% | >90% |
| Query Time | >1s | >5s |
| Replication Lag | >10s | >60s |
| Cache Hit Ratio | <95% | <90% |

---

## ✅ MIGRATION CHECKLIST

### Pre-Migration

- [ ] Backup SQLite database
- [ ] Install PostgreSQL
- [ ] Create database and user
- [ ] Test connection
- [ ] Update .env file

### Migration

- [ ] Run `npx prisma generate`
- [ ] Run `npx prisma migrate dev`
- [ ] Verify schema in Prisma Studio
- [ ] Test API endpoints
- [ ] Test all features

### Post-Migration

- [ ] Monitor performance
- [ ] Set up backups
- [ ] Configure monitoring
- [ ] Update documentation
- [ ] Train team

### Production

- [ ] Use managed PostgreSQL (RDS, Supabase, etc.)
- [ ] Enable SSL
- [ ] Configure connection pooling
- [ ] Set up replication
- [ ] Configure automated backups
- [ ] Set up alerting

---

## 📚 ADDITIONAL RESOURCES

- [Prisma PostgreSQL Guide](https://www.prisma.io/docs/guides/database/postgresql)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [PgBouncer Documentation](https://www.pgbouncer.org/)

---

**Version:** 1.0  
**Last Updated:** 2025-01-22  
**Maintained By:** CITARION Team
