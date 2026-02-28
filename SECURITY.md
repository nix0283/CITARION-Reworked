# 🔒 Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.2.x   | :white_check_mark: |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take the security of CITARION seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### 📧 How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to:
- **Email:** security@citarion.app
- **PGP Key:** [Available upon request]
- **Response Time:** Within 48 hours

### 📝 What to Include

Please include the following information in your report:

1. **Description of the vulnerability**
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if you have one)
5. **Your contact information** for follow-up questions

### 🔐 Encryption for Sensitive Reports

For highly sensitive vulnerabilities, please encrypt your report using our PGP key.

### 🕒 What to Expect

1. **Acknowledgment:** We will acknowledge receipt of your report within 48 hours
2. **Assessment:** We will assess the vulnerability within 5 business days
3. **Resolution:** We will work to resolve the issue as quickly as possible
4. **Disclosure:** We will coordinate with you on public disclosure

### 🏆 Recognition

We appreciate responsible disclosure and will acknowledge your contribution (unless you prefer to remain anonymous).

## Security Best Practices

### For Users

1. **Never commit `.env` files** to version control
2. **Generate unique encryption keys** for each deployment
3. **Use HTTPS** in production
4. **Enable 2FA** for user accounts
5. **Rotate API keys** periodically
6. **Monitor logs** for suspicious activity
7. **Keep dependencies updated**
8. **Use strong passwords** for database and admin accounts

### For Developers

1. **Follow secure coding practices**
2. **Validate all user input**
3. **Use parameterized queries** to prevent SQL injection
4. **Implement rate limiting** on all endpoints
5. **Encrypt sensitive data** at rest and in transit
6. **Use security headers** (CSP, HSTS, etc.)
7. **Regular security audits** and penetration testing
8. **Keep dependencies updated** with security patches

## Security Features

### Encryption

- **Algorithm:** AES-256-GCM
- **Key Derivation:** scrypt (N=16384, r=8, p=1)
- **IV/Salt:** Unique per encryption
- **Authentication:** GCM tag verification

### Rate Limiting

- **Algorithm:** Token Bucket
- **Default Limit:** 100 requests/minute
- **Burst:** 20 requests
- **IP-based:** Yes

### Circuit Breaker

- **Failure Threshold:** 5 failures
- **Reset Timeout:** 60 seconds
- **Half-Open Requests:** 3

### Authentication

- **JWT Tokens:** Secure session management
- **Password Hashing:** bcrypt with salt
- **Session Timeout:** Configurable
- **2FA Support:** Coming soon

## Known Limitations

1. **Demo/Test Mode:** Not intended for production use
2. **Default Credentials:** Change all default passwords before deployment
3. **Development Mode:** Disable in production

## Security Updates

Security updates will be released as patch versions (e.g., 2.2.1, 2.2.2).

### Subscribe to Security Advisories

- GitHub Security Advisories: [Link]
- Email notifications: [Subscribe]

## Credits

We would like to thank the following for their contributions to our security:

- Security researchers who report vulnerabilities
- Community members who help identify issues
- Dependencies maintainers who keep packages secure

---

**Last Updated:** 2025-01-22  
**Version:** 2.2.0
