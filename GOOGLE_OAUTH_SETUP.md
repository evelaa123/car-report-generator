# Настройка Google OAuth для веб-версии

## ⚠️ ВАЖНО

Desktop приложение и веб-приложение используют **разные** OAuth Client ID!

Ваш текущий ID: `3349739192-kqnlktg7c0tmgp6f74uf7m8pbmga14qp` - это для **Desktop** (Electron)

Для веб-версии нужно создать **новый** OAuth Client ID.

## 🔧 Пошаговая инструкция

### Шаг 1: Откройте Google Cloud Console

https://console.cloud.google.com/apis/credentials?project=car-translator

### Шаг 2: Создайте OAuth Client ID для Web

1. Нажмите **"+ CREATE CREDENTIALS"**
2. Выберите **"OAuth client ID"**
3. Application type: **"Web application"**
4. Name: **"Car Report Web App"**

### Шаг 3: Настройте Authorized JavaScript origins

⚠️ **ОБЯЗАТЕЛЬНО** добавьте протокол `http://` или `https://`!

Добавьте эти URLs:

```
http://localhost:5173
http://localhost:3000
https://car-report-generator-alpha.vercel.app
```

**Для вашего Vercel домена:**
```
https://car-report-generator-alpha.vercel.app
```

### Шаг 4: Настройте Authorized redirect URIs

Добавьте те же URLs (с протоколами!):

```
http://localhost:5173
http://localhost:3000
https://car-report-generator-alpha.vercel.app
```

### Шаг 5: Скопируйте Client ID

После создания вы получите Client ID, например:
```
123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

### Шаг 6: Обновите код

Откройте `public/static/app.js` и найдите строку:

```javascript
const CLIENT_ID = 'ЗАМЕНИТЕ_НА_ВАШ_WEB_CLIENT_ID.apps.googleusercontent.com';
```

Замените на ваш новый Client ID:

```javascript
const CLIENT_ID = '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';
```

## 📝 Проверка

После настройки:

1. Перезапустите dev сервер
2. Откройте приложение
3. Нажмите "Google Drive"
4. Должно открыться окно авторизации Google (без ошибок)
5. После авторизации файл загрузится в Drive

## ❌ Частые ошибки

### "Error 400: unsupported_response_type"
- Вы используете Desktop Client ID вместо Web
- Создайте новый Web Application Client ID

### "Error 400: redirect_uri_mismatch"
- Добавьте ваш URL в "Authorized redirect URIs"
- URL должен совпадать **точно** (с/без слеша в конце не имеет значения)

### "Окно авторизации закрыто"
- Разрешите всплывающие окна в браузере
- Убедитесь что не блокируете popup

## 🚀 Для продакшена (Vercel)

После деплоя на Vercel, добавьте в Google Cloud Console:

**Authorized JavaScript origins:**
```
https://your-actual-domain.vercel.app
```

**Authorized redirect URIs:**
```
https://your-actual-domain.vercel.app
```

И обновите CLIENT_ID в коде для продакшен версии.

## 💡 Альтернатива

Можете использовать переменные окружения:

```javascript
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'fallback-id';
```

И создать `.env`:
```
VITE_GOOGLE_CLIENT_ID=ваш-новый-client-id
```

Не забудьте добавить в Vercel Environment Variables!
