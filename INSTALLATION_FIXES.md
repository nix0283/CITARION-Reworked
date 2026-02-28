# ⚠️ ЕСЛИ УСТАНОВКА НЕ РАБОТАЕТ

Попробуйте эти варианты **по порядку**:

---

## 🔴 Вариант 1: PowerShell скрипт (САМЫЙ ПРОСТОЙ)

### Откройте PowerShell

1. Нажмите `Win + X`
2. Выберите "Windows PowerShell" или "Терминал"
3. Перейдите в папку проекта:
   ```powershell
   cd C:\Users\CITARION
   ```

### Запустите установку

```powershell
.\install.ps1
```

**Если ошибка "выполнение скриптов запрещено":**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install.ps1
```

---

## 🔴 Вариант 2: Диагностика

### Запустите диагностику

В командной строке:
```cmd
cd C:\Users\CITARION
diagnose.bat
```

Скрипт:
- ✅ Проверит все компоненты
- ✅ Найдёт проблемы
- ✅ Предложит исправить автоматически

---

## 🔴 Вариант 3: Ручная установка (ШАГ ЗА ШАГОМ)

Откройте `INSTALL_MANUAL.md` и следуйте инструкции.

**Кратко:**

```cmd
REM 1. Проверьте Node.js
node --version

REM 2. Установите зависимости
npm install --legacy-peer-deps

REM 3. Создайте .env
copy .env.example .env

REM 4. Отредактируйте .env (notepad .env)

REM 5. Сгенерируйте Prisma
npx prisma generate

REM 6. Инициализируйте БД
npx prisma db push

REM 7. Запустите тесты
npm run test:windows

REM 8. Запустите проект
npm run dev
```

---

## 🔴 Вариант 4: Полная переустановка

```cmd
REM 1. Закройте все процессы Node.js
taskkill /F /IM node.exe

REM 2. Удалите всё
cd C:\Users\CITARION
rmdir /s /q node_modules
del package-lock.json
del bun.lock
del prisma\dev.db
rmdir /s /q .next

REM 3. Установите заново
npm install --legacy-peer-deps

REM 4. Сгенерируйте Prisma
npx prisma generate

REM 5. Инициализируйте БД
npx prisma db push

REM 6. Запустите
npm run dev
```

---

## 📋 Чеклист проблем

Отметьте что происходит:

- [ ] `node --version` выдаёт ошибку
- [ ] `npm --version` выдаёт ошибку
- [ ] `npm install` зависает
- [ ] `npm install` выдаёт ошибку
- [ ] `npx prisma generate` выдаёт ошибку
- [ ] `npx prisma db push` выдаёт ошибку
- [ ] `npm run dev` выдаёт ошибку
- [ ] Другая проблема (опишите)

---

## 🐛 Частые ошибки

### "npm не является командой"

→ Установите Node.js: https://nodejs.org/
→ Выберите LTS версию
→ **Перезапустите командную строку**

### "EPERM: operation not permitted"

→ Закройте все процессы Node.js: `taskkill /F /IM node.exe`
→ Запустите командную строку **от имени администратора**

### "Cannot find module"

→ `npm install --legacy-peer-deps`
→ `npx prisma generate`

### "Port 3000 is already in use"

→ `netstat -ano | findstr :3000`
→ `taskkill /PID <номер> /F`
→ Или: `npm run dev -- -p 3001`

---

## 📞 Нужна помощь?

### 1. Запустите диагностику

```cmd
diagnose.bat
```

Сделайте скриншот результата.

### 2. Проверьте логи

```cmd
REM Откройте dev.log
type dev.log

REM Или откройте в блокноте
notepad dev.log
```

### 3. Соберите информацию

```cmd
REM Версии
node --version
npm --version

REM Директория
cd

REM Список файлов
dir
```

### 4. Отправьте

- Скриншот ошибки
- Результат `diagnose.bat`
- Версии Node.js и npm
- Что пробовали сделать

---

## ✅ Рабочие команды для проверки

```cmd
REM Проверка Node.js
node --version

REM Проверка npm
npm --version

REM Установка зависимостей
npm install --legacy-peer-deps

REM Генерация Prisma
npx prisma generate

REM Инициализация БД
npx prisma db push

REM Тесты
npm run test:windows

REM Запуск проекта
npm run dev
```

---

## 📁 Файлы для установки

| Файл | Когда использовать |
|------|-------------------|
| `install.ps1` | PowerShell (рекомендуется) |
| `setup-windows.bat` | Автоматическая установка |
| `diagnose.bat` | Поиск проблем |
| `test-windows.bat` | Запуск тестов |
| `INSTALL_MANUAL.md` | Пошаговая инструкция |
| `WINDOWS_SETUP.md` | Подробное руководство |

---

*Версия: 1.1.0*
*Последнее обновление: 2025-01-22*
