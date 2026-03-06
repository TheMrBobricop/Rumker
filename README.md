# Rumker Messenger

Приватный веб-мессенджер с интеграцией Telegram. React-фронтенд + Express-бэкенд в монорепозитории.

---

## Быстрый старт

```bash
cd messenger-app
npm install
npm run dev:full    # Запускает Vite (:5173) + Express (:8080) одновременно
```

Откройте `http://localhost:5173` в браузере.

### Отдельные команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Только фронтенд (Vite :5173) |
| `npm run server` | Только бэкенд (tsx watch, авто-перезагрузка) |
| `npm run dev:full` | Фронтенд + бэкенд одновременно |
| `npm run build` | TypeScript проверка + Vite production build |
| `npm run start:win` | Production запуск (Windows) |
| `npm run deploy` | Build + запуск production |
| `npm run lint` | ESLint проверка |
| `npm run format` | Prettier форматирование |

---

## Архитектура

```
messenger-app/
├── server/                    # Express бэкенд
│   ├── index.ts               # Точка входа, HTTP + Socket.io сервер
│   ├── routes/
│   │   ├── auth.ts            # Авторизация (Email + Telegram)
│   │   ├── chats_supabase.ts  # CRUD чатов и сообщений
│   │   ├── polls.ts           # Опросы (CRUD + голосование)
│   │   ├── voiceChannels.ts   # Голосовые каналы
│   │   ├── friends.ts         # Система друзей
│   │   ├── users_supabase.ts  # Пользователи
│   │   ├── upload.ts          # Загрузка файлов
│   │   └── index.ts           # Маршрутизатор
│   ├── middleware/
│   │   └── auth.ts            # JWT middleware (authenticateToken)
│   ├── socket/
│   │   └── index.ts           # Socket.io: комнаты, события, онлайн-статус
│   ├── services/
│   │   └── telegram.ts        # gram.js интеграция
│   └── lib/
│       ├── supabase.ts        # Supabase клиент
│       └── migrate.ts         # Авто-миграции при старте
│
├── src/                       # React фронтенд
│   ├── pages/
│   │   ├── Login.tsx          # Логин (Telegram / Email / Аккаунт-свитчер)
│   │   ├── Messenger.tsx      # Главная страница (чаты + друзья)
│   │   └── Settings.tsx       # Настройки
│   ├── components/
│   │   ├── chat/              # ChatList, ChatWindow, MessageBubble, MessageInput, ...
│   │   ├── friends/           # FriendsList, UserSearch
│   │   ├── media/             # MediaViewer, MediaUploader, WaveformPlayer, ...
│   │   ├── menu/              # MainMenu (бургер)
│   │   ├── settings/          # Appearance, Cache, Notifications, Privacy, Profile
│   │   ├── users/             # UserProfilePanel, UserSearch
│   │   └── ui/                # shadcn/ui компоненты
│   ├── stores/
│   │   ├── authStore.ts       # Авторизация (JWT + user)
│   │   ├── chatStore.ts       # Чаты, сообщения, отправка
│   │   ├── settingsStore.ts   # Настройки, темы, уведомления
│   │   ├── callStore.ts       # Голосовые/видео звонки
│   │   ├── voiceChannelStore.ts # Голосовые каналы
│   │   └── mediaStore.ts      # Кэш медиа
│   ├── lib/
│   │   ├── api/               # API-клиент (client.ts) + модули (chats, friends, users)
│   │   ├── hooks/             # useSocket, useSwipeBack, useDebounce, useMediaUrl
│   │   ├── cache/             # IndexedDB медиа-кэш
│   │   ├── socket.ts          # Socket.io клиент-сервис
│   │   ├── notifications.ts   # Браузерные уведомления + звук
│   │   ├── savedAccounts.ts   # Сохранённые аккаунты (localStorage)
│   │   ├── tokenStorage.ts    # Fallback хранилище токена
│   │   └── themes.ts          # Тема-пресеты
│   └── types/
│       └── index.ts           # TypeScript типы
│
├── prisma/
│   └── schema.prisma          # Prisma ORM схема
├── uploads/                   # Локальные загрузки
└── dist/                      # Production build
```

---

## Технологии

### Фронтенд
- **React 19** + TypeScript + Vite
- **TailwindCSS 4** + shadcn/ui (Radix)
- **Zustand** — стейт-менеджмент с persist
- **Socket.io-client** — реалтайм
- **React Router v7** — маршрутизация
- **React Hook Form** + Zod — формы и валидация

### Бэкенд
- **Express 5** + TypeScript (tsx watch)
- **Socket.io** — WebSocket сервер
- **JWT** — access (15 мин) + refresh (7 дней) токены
- **bcryptjs** — хеширование паролей
- **Zod** — валидация входных данных
- **Helmet + CORS + Rate Limiting** — безопасность
- **gram.js** — Telegram авторизация

### База данных
- **PostgreSQL** (Supabase) — основная БД
- **Prisma ORM** — схема и миграции
- Модели: `User`, `Chat`, `ChatParticipant`, `Message`, `MessageRead`, `Session`, `FriendRequest`

---

## Функциональность

### Авторизация
- Вход через Email (логин / регистрация)
- Вход через Telegram (код на телефон через gram.js)
- JWT access + refresh токены
- Аккаунт-свитчер на странице входа (сохранённые аккаунты)

### Чаты
- Приватные чаты 1-на-1
- Групповые чаты (создание, участники)
- Каналы
- Отправка текста, фото, видео, голосовых, файлов
- Редактирование и удаление сообщений
- Ответы (reply) на сообщения
- Закрепление сообщений (pin/unpin)
- Поиск по сообщениям внутри чата
- Контекстное меню сообщений
- Drag-and-drop файлов

### Меню вложений (Telegram-style)
- Popup-меню при нажатии скрепки (7 пунктов с иконками)
- Фото/Видео — файлпикер (image/*, video/*)
- Документ — файлпикер (любые файлы)
- Опросы — создание, голосование, реалтайм обновление результатов
- Геолокация — отправка текущих координат с ссылкой на карту
- Контакт — выбор друга для шаринга, кнопка "Написать"
- GIF — загрузка через существующий pipeline

### Голосовые каналы
- Вкладка "Голос" в сайдбаре (список групповых чатов)
- Создание/удаление голосовых каналов внутри группы
- WebRTC аудио через VoiceChannelPeerManager
- Voice Activity Detection (автоматическое определение речи)
- Mute/Deafen с реальным управлением аудио-треками
- Overlay с управлением при подключении к каналу

### Реалтайм (Socket.io)
- Мгновенная доставка сообщений
- Индикаторы набора текста ("печатает...")
- Статусы "Онлайн/Оффлайн"
- Read receipts (прочитано)
- Закрепление/открепление сообщений в реалтайме
- Обновление опросов в реалтайме (poll:update)
- WebRTC сигналинг для голосовых каналов

### Друзья
- Поиск пользователей по username
- Заявки в друзья (отправка, принятие, отклонение)
- Список друзей с онлайн-статусом

### Уведомления
- Браузерные push-уведомления (когда вкладка скрыта)
- Звуковые уведомления (Web Audio API, 600 Hz тон)
- Настраиваемые (вкл/выкл звук, превью, вибрация)
- Счётчик непрочитанных в заголовке вкладки

### Настройки
- 5 тем-пресетов (Classic, Ocean, Midnight, Rose, Sunset)
- Тёмная / Светлая / Авто тема
- Кастомизация баблов (цвет, скругление, размер текста)
- Фон чата (цвет)
- Хвостики сообщений (Bezier curves)
- Кэш медиа (размер, автоочистка, сроки)
- Профиль пользователя

### UI/UX
- Адаптивный дизайн (мобильный + десктоп)
- Свайп-назад на мобильных
- Slide-анимация при переключении чатов
- Emoji-пикер
- Skeleton-загрузка
- Пагинация сообщений (infinite scroll)

---

## Переменные окружения

Файл `messenger-app/.env`:

```env
PORT=8080                          # Порт Express сервера
JWT_SECRET=your_secret             # Ключ подписи JWT
VITE_CLIENT_URL=http://localhost:5173

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DATABASE_URL=postgresql://...

# Telegram (опционально)
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

---

## Деплой (Production)

```bash
cd messenger-app
npm run build           # Собирает фронтенд в dist/
npm run start:win       # Запускает Express, раздающий dist/ + API
```

Express автоматически раздаёт `dist/` как статику и проксирует SPA.

---

## Лицензия

Private project.
