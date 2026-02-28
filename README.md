# 🚀 CITARION - Enterprise-Grade AI-Powered Trading Platform

[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](https://github.com/CITARION/citarion/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-A+-brightgreen.svg)](docs/SECURITY_ENCRYPTION.md)
[![Tests](https://img.shields.io/badge/tests-85+-yellowgreen.svg)](__tests__/)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen.svg)](docs/TESTING_GUIDE.md)

**CITARION** is a professional cryptocurrency trading platform with AI-powered signal analysis, automated copy trading, advanced risk management, and real-time monitoring.

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Security](#-security)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🔐 Enterprise Security
- **AES-256-GCM Encryption** for API keys and sensitive data
- **Token Bucket Rate Limiting** for DDoS protection
- **Circuit Breaker Pattern** for fault tolerance
- **Secure Credential Storage** with encryption at rest

### 📊 Professional Trading
- **Multi-Exchange Support** (Binance, Bybit, OKX, Bitget, BingX)
- **Smart Order Routing** with advanced order types
- **ATR-Based Trailing Stops** for dynamic risk management
- **Multi-Level Take Profit** for position scaling
- **Auto Copy Trading** with profit sharing

### 🤖 AI/ML Intelligence
- **ML Signal Filtering** with 15+ features
- **TensorFlow.js LSTM** for price prediction
- **Genetic Strategy Optimization** for parameter tuning
- **Walk-Forward Analysis** for overfitting prevention
- **Self-Learning Trade Analysis** for continuous improvement

### 📈 Advanced Analytics
- **Performance Metrics** (Sharpe, Sortino, Profit Factor)
- **Pattern Recognition** for trade setups
- **Stress Testing** with 6 predefined scenarios
- **Monte Carlo Simulation** for risk analysis
- **Modern Portfolio Theory** for optimization

### 🎯 Risk Management
- **Portfolio Risk Limits** (max 5% at risk)
- **Position Sizing** (max 10% per position)
- **Daily Loss Limits** (max 5% per day)
- **Commission/Slippage Modeling** for realistic backtesting
- **Correlation Analysis** for diversification

### ⚡ Real-Time Features
- **WebSocket Server** (1000+ concurrent clients)
- **Live Dashboard** with position updates
- **Analytics Dashboard** with performance metrics
- **Backtesting Dashboard** with strategy validation
- **Multi-Channel Alerts** (Telegram, Email, Webhook)

---

## 🏗️ Architecture

```
CITARION/
├── src/
│   ├── lib/
│   │   ├── security/          # Encryption, rate limiting, circuit breaker
│   │   ├── order-management/  # Order execution, trailing stops
│   │   ├── signal-trading/    # ML filtering, Telegram parsing
│   │   ├── copy-trading/      # Copy engine, profit sharing
│   │   ├── websocket/         # Real-time WebSocket server
│   │   ├── monitoring/        # System health, alerts
│   │   ├── analytics/         # Trade analysis, risk engine, MPT
│   │   ├── optimization/      # Genetic optimizer, walk-forward
│   │   └── deep-learning/     # LSTM model, predictions
│   ├── components/            # React components
│   ├── app/                   # Next.js pages & API routes
│   └── middleware.ts          # Rate limiting middleware
├── __tests__/                 # Integration tests (85+ tests)
├── docs/                      # Documentation (29+ pages)
├── prisma/                    # Database schema
├── scripts/                   # Migration & utility scripts
└── deploy-production.*        # Deployment scripts
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- 10GB+ free disk space

### Installation

```bash
# Clone repository
git clone https://github.com/CITARION/citarion.git
cd citarion

# Install dependencies
npm install

# Install TensorFlow.js (for DL predictions)
npm install @tensorflow/tfjs-node

# Install PM2 (for production)
npm install -g pm2
```

### Configuration

```bash
# Copy environment template
cp .env.example .env.production

# Generate encryption key (64 characters)
openssl rand -hex 32

# Edit .env.production with your keys
nano .env.production
```

### Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Apply database schema
npx prisma db push
```

### Build & Run

```bash
# Production build
npm run build

# Start with PM2
pm2 start npm --name "citarion" -- start

# Check status
pm2 status

# View logs
pm2 logs citarion
```

### Access

- **Dashboard:** http://localhost:3000
- **Analytics:** http://localhost:3000/analytics
- **Backtest:** http://localhost:3000/backtest
- **Health API:** http://localhost:3000/api/health

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Security](docs/SECURITY_ENCRYPTION.md) | Encryption, rate limiting, circuit breaker |
| [Order Management](docs/ORDER_MANAGEMENT.md) | Order execution, trailing stops |
| [Signal Trading](docs/SIGNAL_TRADING.md) | ML filtering, Telegram parsing |
| [Copy Trading](docs/COPY_TRADING.md) | Copy engine, profit sharing |
| [Analytics](docs/ADVANCED_ANALYTICS.md) | Trade analysis, risk management |
| [Deep Learning](docs/DEEP_LEARNING.md) | LSTM model, predictions |
| [Genetic Optimizer](docs/GENETIC_OPTIMIZER.md) | Strategy optimization |
| [Deployment](docs/PRODUCTION_DEPLOYMENT.md) | Production deployment guide |
| [Testing](docs/TESTING_GUIDE.md) | Testing procedures |

---

## 🔌 API Endpoints

### Health & Monitoring

```bash
GET /api/health                    # Health check
GET /api/monitoring/health         # System health
GET /api/monitoring/alerts         # Active alerts
GET /api/monitoring/metrics        # System metrics
```

### Analytics

```bash
GET  /api/analytics/performance    # Performance metrics
GET  /api/analytics/recommendations # AI recommendations
GET  /api/analytics/patterns       # Recognized patterns
POST /api/analytics/stress-test    # Run stress test
POST /api/analytics/monte-carlo    # Monte Carlo simulation
```

### Deep Learning

```bash
GET  /api/dl/predict               # Get DL prediction
POST /api/dl/train                 # Train DL model
GET  /api/dl/metrics               # Model metrics
```

### Optimization

```bash
POST /api/optimization/run         # Run optimization
GET  /api/optimization/results     # Get results
POST /api/optimization/deploy      # Deploy strategy
POST /api/backtest/walk-forward    # Walk-forward analysis
```

### Backtesting

```bash
POST /api/backtest/run             # Run backtest
GET  /api/backtest/status          # Get status
```

---

## 🛡️ Security

### Encryption

- **Algorithm:** AES-256-GCM
- **Key Derivation:** scrypt (N=16384, r=8, p=1)
- **IV/Salt:** Unique per encryption
- **Authentication:** GCM tag verification

### Rate Limiting

- **Algorithm:** Token Bucket
- **Default Limit:** 100 requests/minute
- **Burst:** 20 requests
- **Whitelist:** Configurable IP whitelist

### Circuit Breaker

- **Failure Threshold:** 5 failures
- **Reset Timeout:** 60 seconds
- **Half-Open Requests:** 3

### Best Practices

1. Never commit `.env` files
2. Rotate encryption keys periodically
3. Use HTTPS in production
4. Enable 2FA for user accounts
5. Monitor logs for suspicious activity

---

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Specific module
npm test -- encryption.test.ts

# Watch mode
npm run test:watch
```

### Test Coverage

| Module | Coverage | Tests |
|--------|----------|-------|
| Security | 95% | 53 |
| Monitoring | 90% | 22 |
| Analytics | 85% | 10+ |
| **Total** | **90%+** | **85+** |

---

## 🚀 Deployment

### Production Deployment

```bash
# Windows
.\deploy-production.ps1

# Linux/Mac
bash deploy-production.sh
```

### Verification

```bash
# Health check
curl http://localhost:3000/api/health

# Monitoring
curl http://localhost:3000/api/monitoring/health

# Analytics
curl http://localhost:3000/api/analytics/performance
```

### PM2 Commands

```bash
# Status
pm2 status

# Logs
pm2 logs citarion

# Restart
pm2 restart citarion

# Stop
pm2 stop citarion

# Delete
pm2 delete citarion

# Monitor
pm2 monit
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/citarion.git

# Install dependencies
npm install

# Run in development
npm run dev

# Run tests
npm test
```

### Code Style

- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Use TypeScript strict mode

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Support

### Documentation

- [Full Documentation](docs/)
- [API Reference](docs/API_REFERENCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

### Issues

- [GitHub Issues](https://github.com/CITARION/citarion/issues)
- [Feature Requests](https://github.com/CITARION/citarion/issues/new?template=feature_request.md)
- [Bug Reports](https://github.com/CITARION/citarion/issues/new?template=bug_report.md)

### Contact

- **Email:** support@citarion.app
- **Telegram:** @citarion_support
- **Discord:** [Join Server](https://discord.gg/citarion)

---

## 🏆 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database by [Prisma](https://prisma.io/)
- ML by [TensorFlow.js](https://www.tensorflow.org/js)
- UI by [shadcn/ui](https://ui.shadcn.com)

---

## 📊 Project Statistics

| Metric | Value |
|--------|-------|
| **Version** | 2.2.0 |
| **Files** | 58 |
| **Lines of Code** | 19,000+ |
| **Documentation** | 16,000+ lines |
| **Tests** | 85+ |
| **Test Coverage** | 90%+ |
| **Security Score** | 9.5/10 |
| **Development Time** | ~64 hours |

---

**⭐ Star this repo if you find it useful!**

**🚀 Happy Trading!**

---

*Last Updated: 2025-01-22*
