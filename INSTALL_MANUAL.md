# 🔧 CITARION - Пошаговая установка (Windows)

Если автоматическая установка не работает, следуйте этой инструкции.

---

## 📋 Шаг 1: Проверка Node.js

### Откройте командную строку

Нажмите `Win + R`, введите `cmd`, нажмите Enter

### Проверьте Node.js

```cmd
node --version
```

**Ожидаемый результат:**
```
v20.x.x
```

**Если ошибка "не является внутренней или внешней командой":**

1. Скачайте Node.js: https://nodejs.org/
2. Выберите **LTS версию** (зелёная кнопка)
3. Запустите установщик
4. Нажмите "Next" на всех шагах
5. **Перезапустите командную строку**
6. Проверьте снова: `node --version`

### Проверьте npm

```cmd
npm --version
```

**Ожидаемый результат:**
```
10.x.x
```

---

## 📋 Шаг 2: Переход в директорию проекта

```cmd
cd C:\Users\CITARION
```

Проверьте что вы в правильной папке:

```cmd
dir
```

Вы должны увидеть файлы:
- `package.json`
- `setup-windows.bat`
- `prisma\` (папка)
- `src\` (папка)

---

## 📋 Шаг 3: Очистка (если была предыдущая установка)

```cmd
REM Удалите старые зависимости
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
if exist bun.lock del bun.lock
```

---

## 📋 Шаг 4: Установка зависимостей

### Вариант A: npm (рекомендуется)

```cmd
npm install --legacy-peer-deps
```

**Ожидаемый результат:**
```
added XXX packages in XXs
```

**Если ошибка "EPERM":**
```cmd
REM Закройте все процессы Node.js
taskkill /F /IM node.exe

REM Попробуйте снова
npm install --legacy-peer-deps
```

**Если ошибка "network timeout":**
```cmd
REM Очистите кэш npm
npm cache clean --force

REM Попробуйте снова
npm install --legacy-peer-deps
```

### Вариант B: Bun (если установлен)

```cmd
bun install
```

---

## 📋 Шаг 5: Создание .env файла

```cmd
REM Скопируйте пример
copy .env.example .env
```

**Откройте .env в блокноте:**
```cmd
notepad .env
```

**Установите минимум эти переменные:**

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="citarion-secret-key-min-32-characters-long"
NEXTAUTH_URL="http://localhost:3000"
TRADINGVIEW_WEBHOOK_SECRET="webhook-secret-key"
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
ENCRYPTION_KEY="32-character-encryption-key-here"
```

**Сохраните и закройте блокнот**

---

## 📋 Шаг 6: Генерация Prisma клиента

```cmd
npx prisma generate
```

**Ожидаемый результат:**
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
```

**Если ошибка:**
```cmd
REM Переустановите Prisma
npm uninstall prisma @prisma/client
npm install prisma @prisma/client --save-dev
npx prisma generate
```

---

## 📋 Шаг 7: Инициализация базы данных

```cmd
npx prisma db push
```

**Ожидаемый результат:**
```
Your database is now in sync with your schema.
```

**Если ошибка "database is locked":**
```cmd
REM Удалите базу данных
del prisma\dev.db

REM Создайте заново
npx prisma db push
```

**Если ошибка "ENOENT":**
```cmd
REM Создайте папку prisma если нет
if not exist prisma mkdir prisma

REM Попробуйте снова
npx prisma db push
```

---

## 📋 Шаг 8: Проверка установки

### Запустите тесты

```cmd
npm run test:windows
```

**Ожидаемый результат:**
```
PASS  __tests__/paper-trading.test.ts
PASS  __tests__/tradingview-webhook.test.ts

Test Suites: 2 passed, 2 total
Tests:       30 passed, 30 total
```

### Запустите проект

```cmd
npm run dev
```

**Ожидаемый результат:**
```
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Откройте браузер:** http://localhost:3000

---

## 🐛 Частые ошибки и решения

### Ошибка 1: "npm не является командой"

**Решение:**
```
1. Установите Node.js с https://nodejs.org/
2. Выберите LTS версию
3. После установки ПЕРЕЗАПУСТИТЕ командную строку
4. Проверьте: node --version
```

### Ошибка 2: "EPERM: operation not permitted"

**Решение:**
```cmd
REM Закройте все процессы Node.js
taskkill /F /IM node.exe

REM Запустите командную строку от имени администратора
REM Правый клик на cmd → Запустить от имени администратора

REM Попробуйте снова
npm install --legacy-peer-deps
```

### Ошибка 3: "Cannot find module '@/lib/...'"

**Решение:**
```cmd
REM Перегенерируйте Prisma
npx prisma generate

REM Очистите кэш Next.js
if exist .next rmdir /s /q .next

REM Перезапустите
npm run dev
```

### Ошибка 4: "Port 3000 is already in use"

**Решение:**
```cmd
REM Найдите процесс на порту 3000
netstat -ano | findstr :3000

REM Убейте процесс (замените XXXX на ваш PID)
taskkill /PID XXXX /F

REM Или используйте другой порт
npm run dev -- -p 3001
```

### Ошибка 5: "ENOENT: no such file or directory, open 'prisma/dev.db'"

**Решение:**
```cmd
REM Создайте папку prisma
if not exist prisma mkdir prisma

REM Инициализируйте БД
npx prisma db push
```

### Ошибка 6: "JavaScript heap out of memory"

**Решение:**
```cmd
REM Увеличьте память для Node.js
set NODE_OPTIONS=--max-old-space-size=4096
npm install
```

### Ошибка 7: Долгая установка (>10 минут)

**Решение:**
```cmd
REM Используйте китайский镜像 для npm
npm config set registry https://registry.npmmirror.com

REM Попробуйте снова
npm install --legacy-peer-deps
```

---

## ✅ Проверка успешной установки

### Чеклист

- [ ] `node --version` показывает v18.x или новее
- [ ] `npm --version` показывает 9.x или новее
- [ ] Папка `node_modules` существует
- [ ] Файл `.env` существует и заполнен
- [ ] `prisma/dev.db` существует
- [ ] Тесты проходят: `npm run test:windows`
- [ ] Проект запускается: `npm run dev`
- [ ] Сайт открывается: http://localhost:3000

### Команды для проверки

```cmd
REM Проверка версий
node --version && npm --version

REM Проверка файлов
dir package.json && dir .env && dir prisma\dev.db

REM Проверка тестов
npm run test:windows

REM Проверка запуска
npm run dev
```

---

## 📞 Если ничего не помогает

### 1. Запустите диагностику

```cmd
diagnose.bat
```

### 2. Проверьте логи

```cmd
REM Откройте dev.log если существует
type dev.log
```

### 3. Полная переустановка

```cmd
REM 1. Закройте все процессы Node.js
taskkill /F /IM node.exe

REM 2. Удалите всё
rmdir /s /q node_modules
del package-lock.json
del bun.lock
del prisma\dev.db
rmdir /s /q .next

REM 3. Установите заново
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push

REM 4. Запустите
npm run dev
```

### 4. Создайте issue

Опишите:
1. Какую команду выполняли
2. Какую ошибку получили
3. Версии Node.js и npm
4. Скриншот ошибки

---

## 🎯 Минимальная установка (только самое необходимое)

Если хотите быстро запустить без тестов и лишнего:

```cmd
REM 1. Установка зависимостей
npm install --legacy-peer-deps

REM 2. Создание .env
copy .env.example .env

REM 3. Генерация Prisma
npx prisma generate

REM 4. Инициализация БД
npx prisma db push

REM 5. Запуск
npm run dev
```

---

*Версия: 1.1.0*
*Последнее обновление: 2025-01-22*
