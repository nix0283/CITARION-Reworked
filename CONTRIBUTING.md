# Contributing to CITARION

Thank you for your interest in contributing to CITARION! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Welcome newcomers and help them learn
- Keep discussions professional and on-topic

---

## Getting Started

### 1. Fork the Repository

Click the "Fork" button on GitHub to create your own copy of the repository.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/citarion.git
cd citarion
```

### 3. Add Upstream Remote

```bash
git remote add upstream https://github.com/CITARION/citarion.git
git fetch upstream
```

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

```bash
# Install dependencies
npm install

# Install TensorFlow.js
npm install @tensorflow/tfjs-node

# Generate Prisma client
npx prisma generate

# Run in development mode
npm run dev
```

### Environment Setup

```bash
# Copy environment template
cp .env.example .env.local

# Generate encryption key
openssl rand -hex 32

# Edit .env.local with your keys
```

---

## Pull Request Process

### 1. Create a Branch

```bash
# Update from upstream
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write clean, readable code
- Follow coding standards
- Add tests for new features
- Update documentation

### 3. Commit Changes

```bash
# Stage changes
git add .

# Commit with meaningful message
git commit -m "feat: add new feature description"
```

### 4. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 5. Create Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Select your feature branch
4. Write a clear description
5. Submit for review

---

## Coding Standards

### TypeScript

- Use strict mode
- Define explicit types
- Avoid `any` type
- Use interfaces for objects

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  email: string;
}

// ❌ Avoid
const user: any = {};
```

### Naming Conventions

- **Variables:** camelCase (`userName`, `totalProfit`)
- **Functions:** camelCase (`calculateProfit`, `getUser`)
- **Classes:** PascalCase (`OrderManager`, `RiskEngine`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_KEY`)
- **Files:** kebab-case (`order-manager.ts`, `risk-engine.ts`)

### Code Organization

- Keep functions small and focused
- One responsibility per class
- Use dependency injection
- Avoid global state

---

## Testing

### Write Tests

```bash
# Run all tests
npm test

# Run specific test
npm test -- order-manager.test.ts

# Run with coverage
npm run test:coverage
```

### Test Guidelines

- Test happy path and edge cases
- Mock external dependencies
- Use descriptive test names
- Aim for 90%+ coverage

```typescript
// ✅ Good test name
describe('OrderManager', () => {
  it('should place order with valid parameters', async () => {
    // Test implementation
  });

  it('should reject order with invalid quantity', async () => {
    // Test implementation
  });
});
```

---

## Documentation

### Update Documentation

- Update README.md for new features
- Add JSDoc comments to functions
- Update API documentation
- Add examples for new functionality

### JSDoc Comments

```typescript
/**
 * Calculate portfolio risk metrics
 * 
 * @param weights - Array of asset weights
 * @param correlationMatrix - Asset correlation matrix
 * @param volatilities - Array of asset volatilities
 * @returns Portfolio risk metrics
 */
function calculatePortfolioRisk(
  weights: number[],
  correlationMatrix: number[][],
  volatilities: number[]
): RiskMetrics {
  // Implementation
}
```

---

## Commit Messages

### Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
feat(order-management): add trailing stop functionality

# Bug fix
fix(rate-limiter): resolve memory leak in token bucket

# Documentation
docs(security): update encryption documentation

# Refactor
refactor(analytics): improve performance of risk calculations

# Tests
test(monitoring): add tests for alert service
```

---

## Issue Guidelines

### Bug Reports

Include:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (Node.js version, OS, etc.)
- Screenshots/logs if applicable

### Feature Requests

Include:
- Description of the feature
- Use case
- Expected behavior
- Alternatives considered

---

## Review Process

1. **Automated Checks:** CI/CD pipelines run tests and linting
2. **Code Review:** Maintainers review code quality and functionality
3. **Testing:** Reviewers test the changes
4. **Approval:** At least one maintainer approval required
5. **Merge:** Changes merged to main branch

---

## Questions?

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/CITARION/citarion/issues)
- **Discussions:** [GitHub Discussions](https://github.com/CITARION/citarion/discussions)

---

Thank you for contributing to CITARION! 🚀
