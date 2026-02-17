# Rumker Messenger

Приватный мессенджер с интеграцией Telegram. Монорепо с React фронтендом и Express бэкендом.

## Стек технологий

### Frontend
- **React 19** + TypeScript, Vite 7, TailwindCSS 4
- **shadcn/ui** (Radix) -- компоненты UI
- **Zustand** -- стейт-менеджмент (stores: auth, chat, settings, media)
- **React Router v7** -- маршрутизация (`/login`, `/`, `/settings`)
- **Lucide React** -- иконки
- **Sonner** -- toast-уведомления

### Backend
- **Express 5** + TypeScript (запуск через `tsx watch`)
- **Prisma ORM** -- PostgreSQL (Supabase) / SQLite для локальной разработки
- **JWT** -- access token (15 мин) + refresh token (7 дней, httpOnly cookie)
- **bcrypt** -- хэширование паролей
- **Multer** -- загрузка файлов
- **Helmet + CORS + Rate Limiting** -- безопасность

### База данных
- **PostgreSQL** (Supabase) в продакшене
- **SQLite** (`prisma/dev.db`) для локальной разработки
- Модели: `User`, `Chat`, `ChatParticipant`, `Message`, `MessageRead`, `Session`, `FriendRequest`, `Contact`

## Быстрый старт

### Требования
- Node.js v18+
- npm

### Установка

```bash
cd messenger-app
npm install
```

### Настройка окружения

Скопируйте `.env.example` в `.env` и заполните:

```env
# Database
SUPABASE_DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Auth
JWT_SECRET=your-secret-key

# Server
PORT=3000
VITE_CLIENT_URL=http://localhost:5173

# Frontend
VITE_API_URL=http://localhost:3000/api

# Telegram (опционально)
TELEGRAM_API_ID=your-api-id
TELEGRAM_API_HASH=your-api-hash
```

### Запуск базы данных

```bash
npm run prisma:generate   # Генерация Prisma Client
npm run prisma:migrate    # Применение миграций
```

### Запуск

```bash
npm run dev:full    # Frontend (Vite :5173) + Backend (Express :3000) одновременно
npm run dev         # Только Frontend
npm run server      # Только Backend (с авто-перезагрузкой)
```

### Сборка

```bash
npm run build         # TypeScript проверка + Vite production build
npm run lint          # ESLint
npm run format        # Prettier (запись)
npm run format:check  # Prettier (проверка)
```

## Архитектура

### Структура проекта

```
messenger-app/
├── src/                          # Frontend
│   ├── components/
│   │   ├── chat/                 # ChatList, ChatWindow, MessageBubble, MessageInput, MessageContextMenu
│   │   ├── friends/              # FriendsList, UserSearch
│   │   ├── media/                # CachedImage, MediaViewer, MediaUploader
│   │   ├── menu/                 # MainMenu (боковое меню)
│   │   ├── settings/             # AppearanceSettings, ProfileSettings, CacheSettings
│   │   ├── users/                # UserSearch, UserProfilePanel
│   │   └── ui/                   # shadcn/ui компоненты
│   ├── lib/
│   │   ├── api/                  # client.ts (синглтон), chats.ts, friends.ts, users.ts
│   │   ├── cache/                # IndexedDB кэш медиа
│   │   ├── hooks/                # useDebounce, useMediaUrl
│   │   ├── themes.ts             # 5 пресетов тем (Classic, Ocean, Midnight, Rose, Sunset)
│   │   ├── tokenStorage.ts       # Хранение JWT токенов
│   │   └── utils.ts              # cn() и утилиты
│   ├── pages/                    # Login, Messenger, Settings
│   ├── stores/                   # Zustand: authStore, chatStore, settingsStore, mediaStore
│   ├── types/                    # TypeScript типы
│   ├── App.tsx                   # Роутинг
│   └── index.css                 # Tailwind + темы + анимации
│
├── server/                       # Backend
│   ├── routes/
│   │   ├── auth.ts               # POST /register, /login, /refresh, /logout
│   │   ├── chats_supabase.ts     # CRUD чатов и сообщений (активный)
│   │   ├── users_supabase.ts     # Поиск и профили пользователей (активный)
│   │   ├── friends.ts            # Система друзей (заявки, список)
│   │   ├── upload.ts             # Загрузка файлов в Supabase Storage
│   │   ├── chats.ts              # Альтернативный Prisma-вариант
│   │   └── users.ts              # Альтернативный Prisma-вариант
│   ├── middleware/auth.ts         # JWT верификация (authenticateToken)
│   ├── services/telegram.ts       # gram.js интеграция
│   ├── socket/index.ts            # Socket.io (заглушка)
│   ├── lib/supabase.ts            # Supabase клиент
│   └── index.ts                   # Express сервер с Helmet/CORS
│
├── prisma/
│   ├── schema.prisma              # Схема БД
│   └── dev.db                     # SQLite для разработки
│
└── package.json
```

### API эндпоинты

| Группа | Эндпоинт | Описание |
|--------|----------|----------|
| Auth | `POST /api/auth/register` | Регистрация |
| Auth | `POST /api/auth/login` | Вход |
| Auth | `POST /api/auth/refresh` | Обновление токена |
| Auth | `POST /api/auth/logout` | Выход |
| Chats | `GET /api/chats` | Список чатов |
| Chats | `POST /api/chats/private` | Создать приватный чат |
| Chats | `GET /api/chats/:id/messages` | Сообщения чата |
| Chats | `POST /api/chats/:id/messages` | Отправить сообщение |
| Chats | `PATCH /api/chats/:id/messages/:msgId` | Редактировать |
| Chats | `DELETE /api/chats/:id/messages/:msgId` | Удалить |
| Friends | `GET /api/friends` | Список друзей |
| Friends | `GET /api/friends/requests` | Входящие заявки |
| Friends | `POST /api/friends/request` | Отправить заявку |
| Friends | `POST /api/friends/accept/:id` | Принять |
| Friends | `POST /api/friends/reject/:id` | Отклонить |
| Upload | `POST /api/upload` | Загрузка медиа (до 50MB) |
| Users | `GET /api/users/search?q=` | Поиск пользователей |
| Health | `GET /api/health` | Статус сервера |

### Ключевые паттерны

- Vite dev-сервер проксирует `/api` на `http://localhost:3000` -- бэкенд должен быть запущен
- Auth flow: login -> токен в Zustand (persist в localStorage) -> `Authorization: Bearer` заголовок
- API клиент (`src/lib/api/client.ts`) -- синглтон с авто-рефрешем токенов при 401/403
- Двойная поддержка БД: Supabase-роуты (`*_supabase.ts`) работают параллельно с Prisma-роутами
- Кэширование медиа через IndexedDB (`src/lib/cache/`)
- 5 тем-пресетов: Classic, Ocean, Midnight, Rose, Sunset (меняют все CSS-переменные)
- Drag-and-drop файлов в чат с выбором формата (сжатие / без сжатия)

## Лицензия

Private project.
