# Rumker Messenger — Детальный TODO

Последнее обновление: 06.03.2026

---

## Критические / Блокирующие

- [x] **React 19 infinite loop fix** — заменены все вызовы Zustand-сторов без селектора (`useStore()`) на индивидуальные селекторы (`useStore((s) => s.field)`). Затронуто 12 файлов: Messenger.tsx, ChatWindow.tsx, ChatList.tsx, MessageBubble.tsx, MainMenu.tsx, App.tsx, NewChatFAB.tsx, UserSearch.tsx (x2), все settings компоненты, все voice компоненты. Исправлен `pinnedMessages || []` → `useMemo`.

- [x] **"Нет сообщений" при наличии чата** — исправлен race condition: добавлен `loadedChatsRef` (Set), "Нет сообщений" показывается только после завершения первой загрузки для конкретного чата.

- [x] **MediaViewer — полный Telegram-style** — переписан полностью:
  - Имя отправителя + дата/время в заголовке
  - Thumbnail strip снизу с активным индикатором и плавным скроллом
  - Pinch-to-zoom (мобильный), pan при zoom > 1
  - Double-tap для zoom 1x ↔ 2x
  - Клавиши +/- для зума
  - Стрелки навигации (hover-visible), свайп влево/вправо, свайп вниз = закрыть
  - Fullscreen на весь экран
  - MediaItem теперь содержит `senderName` и `timestamp`

- [x] **MediaViewer не открывался в профиле** — исправлено: `MediaViewer` использует `createPortal(document.body)`, но рендерился внутри `content` который помещался в shadcn `Sheet` (тоже портал). Вынесен за пределы `content` и рендерится напрямую в компоненте — работает в обоих режимах (inline + Sheet).

- [x] **UserProfilePanel**: добавлен onClick на медиа-ячейки → открывает MediaViewer с gallery mode.

- [x] **GroupInfoPanel**: добавлен MediaViewer с onClick на медиа. Поиск участников переделан — теперь скрыт по умолчанию, открывается по кнопке 🔍 справа от "Добавить участника". Закрывается крестиком.

- [ ] **Supabase Storage upload** — проверить:
  1. Bucket `chat-media` создан в Supabase Dashboard -> Storage
  2. RLS-политики разрешают INSERT для authenticated
  3. `SUPABASE_SERVICE_ROLE_KEY` корректен в `.env`

- [x] **Telegram 2FA** — при ошибке `SESSION_PASSWORD_NEEDED` показывается поле ввода пароля (step '2fa'). Бэкенд: `POST /api/auth/telegram/check-password`.

---

## Бэкенд

### API endpoints — нужна доработка
- [ ] **POST /api/chats/:chatId/messages/forward** — пересылка сообщений в другой чат
- [x] **Reactions API** — POST `/api/chats/:chatId/messages/:messageId/reactions` (toggle) + Socket.io `message:reaction` + DB migration 005
- [ ] **Group admin** — добавить/убрать участников, сменить владельца, изменить описание/аватар
- [ ] **User profile update** — PUT `/api/users/me` (bio, avatar, first_name, last_name)
- [ ] **Thread/Topic API** — создание веток и подветок для каналов (как в Telegram)

### Валидация
- [ ] Zod-схемы на все эндпоинты `/api/chats/*`
- [ ] Zod-схемы на `/api/friends/*`
- [ ] Zod-схемы на `/api/users/*`
- [ ] Проверка лимита длины сообщений (4096 символов)

### Безопасность
- [x] **JWT секреты разделены** — отдельные `JWT_SECRET` и `JWT_REFRESH_SECRET`, токены содержат `type: 'access'/'refresh'`, refresh не принимается как Bearer
- [x] **Refresh tokens хешируются** — SHA-256 перед записью в БД (`token_hash`)
- [x] **.env в .gitignore** — секреты больше не коммитятся, добавлен `.env.example`
- [x] **SVG upload запрещён** — убран `image/svg+xml` из разрешённых MIME-типов
- [x] **Upload лимит 50MB** — было 1GB memoryStorage, теперь diskStorage 50MB
- [x] **JSON body 1MB** — было 100MB, теперь 1MB
- [x] **CSP усилена** — убраны `unsafe-inline`/`unsafe-eval` из scriptSrc
- [x] **Uploads защищены** — `X-Content-Type-Options: nosniff`, отдельная CSP, SVG/HTML принудительно скачиваются
- [x] **Membership checks** — voice channels, polls vote, clear chat теперь проверяют участие в чате
- [x] **Clear chat — только admin** — требует `owner` или право `can_delete_messages`
- [x] **Logout endpoint** — `POST /api/auth/logout` удаляет сессию из БД, очищает cookie
- [ ] CSRF токены для cookie-based auth
- [ ] Ограничение размера аватаров (5MB)

### Telegram интеграция
- [ ] Синхронизация истории диалогов при входе
- [ ] Получение списка реальных чатов через `gram.js`
- [ ] Обработка входящих обновлений (MTProto Updates)
- [ ] Шифрование telegram session перед сохранением в DB

---

## Фронтенд

### Функциональность
- [ ] **Forward dialog** — выбрать чат и переслать сообщение (UI частично есть)
- [x] **Реакции** — emoji picker + toggle API + Socket.io broadcast + optimistic update
- [ ] **Стикеры** — панель стикер-паков, отправка, импорт из Telegram
- [x] **Прочтение сообщений** — Telegram-style ✓✓, persistent через message_reads, бэкенд возвращает `status: 'read'`
- [x] **Статусы доставки** — sent → read (бэкенд вычисляет из message_reads при загрузке сообщений)
- [x] **GIF-пикер** — интеграция с Tenor API, поиск, категории, masonry grid
- [ ] **Thread/Topic UI** — ветки и подветки для каналов (Telegram-style)
- [x] **Telegram-style меню вложений** — popup-меню скрепки с 7 пунктами
- [x] **Опросы** — создание, голосование, реалтайм обновление (poll:update)
- [x] **Геолокация** — отправка координат, LocationBubble с ссылкой на карту
- [x] **Контакт** — шаринг контакта из друзей, ContactBubble с "Написать"
- [x] **Голосовые каналы** — Discord-style, WebRTC аудио, VAD, mute/deafen
- [x] **Голосовые сообщения** — запись через MediaRecorder API, отправка
- [x] **Emoji-пикер** — полный пикер с категориями, поиском, стикерами
- [x] **Discord-style звонки** — переделан UI звонков: draggable/resizable/dockable окно, deafen, connection quality мониторинг, TURN серверы

### UI/UX улучшения
- [ ] **Skeleton-загрузка** — при загрузке списка чатов и сообщений
- [ ] **Pull-to-refresh** — обновление списка чатов на мобильных
- [ ] **Offline-режим** — показывать кэшированные сообщения при отсутствии сети
- [ ] **Глобальный поиск** — поиск по всем чатам в шапке
- [x] **Telegram-style ввод** — скрепка внутри поля, emoji внутри, mic/send снаружи
- [x] **Telegram-style пин** — сегментные индикаторы, навигация по закреплённым
- [x] **Discord-style голос** — overlay внизу sidebar, каналы с участниками, панель участников в main area
- [x] **Inline профиль** — анимированная панель справа (десктоп), Sheet (мобильный)
- [x] **Telegram-style профили** — переписаны UserProfilePanel и GroupInfoPanel: убран градиент, X слева / карандаш справа, инфо-список с tap-to-copy, анимации slide-in
- [x] **Discord-style ActiveCallOverlay** — перетаскиваемое/масштабируемое окно, прикрепление к краям (dock left/right/top/bottom), fullscreen, PiP вебкамера (тоже перетаскивается), анимации открытия/закрытия
- [x] **Discord-style IncomingCallModal** — toast-popup в правом верхнем углу вместо fullscreen модала
- [x] **MediaViewer анимация** — плавный zoom-in при открытии, увеличенная область просмотра (100dvh-60px)
- [x] **Анимации профилей и чат-листа** — profile-header-in, profile-item-in (slide from right), chat-item-in (staggered), profile-section-in (tab switch)
- [x] **Анимация отправки** — плавное появление нового сообщения
- [x] **Выделение сообщений** — long-press + drag, bulk delete/forward/copy
- [x] **Scroll to bottom** — стрелка с бейджем непрочитанных, всегда в конец

### Оптимизация
- [x] **Code splitting** — `React.lazy()` для Messenger, Settings, GroupInfoPanel, PollCreator, GifPicker + `manualChunks` в vite.config.ts
- [x] **Виртуализация** — `@tanstack/react-virtual` (useVirtualizer) для списка сообщений — ~30 DOM-элементов вместо всех
- [ ] **Image optimization** — WebP конвертация, responsive sizes
- [ ] **Bundle analysis** — `vite-bundle-visualizer` для поиска тяжёлых модулей

### Accessibility
- [ ] aria-labels на все интерактивные элементы
- [ ] Keyboard navigation в списке чатов
- [ ] Focus trap в модальных окнах
- [ ] Screen reader support для сообщений

---

## Инфраструктура

### CI/CD
- [ ] GitHub Actions: `npm run lint` + `npm run build` на каждый push
- [ ] Автоматический деплой при merge в main

### Docker
- [ ] `Dockerfile` — multi-stage (build frontend + run Express)
- [ ] `docker-compose.yml` — app + PostgreSQL + Redis (для будущего)
- [ ] `.dockerignore` — node_modules, uploads, .env

### Production
- [ ] Nginx reverse proxy конфигурация
- [ ] SSL сертификат (Let's Encrypt)
- [ ] PM2 для process management
- [ ] Health check endpoint (`GET /api/health`)

---

## Технический долг

### Дублирование кода
- [ ] Удалить `server/routes/chats.ts` (оставить только `chats_supabase.ts`)
- [ ] Удалить `server/routes/users.ts` (оставить только `users_supabase.ts`)
- [ ] Удалить `server/database/index.ts` (если не используется)

### Чистка
- [ ] Удалить debug-файлы: `TestAuth.tsx`, `debug-auth.js`, `test-*.js`, `clear-storage.js`
- [ ] Удалить неиспользуемые зависимости из package.json
- [ ] Проверить и убрать `eslint-disable` комментарии

### Тесты
- [ ] Unit: API client (`src/lib/api/client.ts`)
- [ ] Unit: chatStore actions
- [ ] Integration: auth flow (register → login → refresh → logout)
- [ ] Integration: send message flow
- [ ] E2E: Playwright для основных сценариев

---

## Завершённое

### Ядро
- [x] JWT авторизация (access + refresh)
- [x] Email регистрация/вход
- [x] Telegram авторизация (gram.js)
- [x] Приватные и групповые чаты
- [x] Отправка/редактирование/удаление сообщений
- [x] Голосовые сообщения (запись MediaRecorder + отправка)
- [x] Фото/видео загрузка + drag-and-drop
- [x] Reply на сообщения
- [x] Pin/Unpin сообщений
- [x] Опросы (создание, голосование, реалтайм)
- [x] Геолокация (отправка координат)
- [x] Контакты (шаринг из друзей)

### Реалтайм
- [x] Socket.io сервер (JWT auth, авто-join комнат)
- [x] Мгновенная доставка сообщений
- [x] Typing indicators
- [x] Online/Offline статусы
- [x] Read receipts (Telegram-style ✓✓, persistent, real-time, контекстное меню "кто прочитал")
- [x] Звуковые уведомления

### UI
- [x] Адаптивный дизайн (мобильный + десктоп)
- [x] 5 тем-пресетов + кастомизация
- [x] Telegram-style ввод (скрепка, emoji, mic/send)
- [x] Telegram-style закреплённые сообщения
- [x] Discord-style голосовые каналы (WebRTC, кастомные разделы с CRUD)
- [x] Inline профиль-панель (десктоп) + Sheet (мобильный)
- [x] Хвостики сообщений
- [x] Контекстное меню
- [x] Emoji-пикер с категориями и стикерами
- [x] Система друзей с UI
- [x] Аккаунт-свитчер на логине
- [x] Кэш медиа (IndexedDB)
- [x] Выделение сообщений (long-press + drag)
- [x] Поиск сообщений в чате
- [x] Пересылка сообщений
- [x] GIF-пикер (Tenor API, поиск, категории, masonry grid)
- [x] Плавная анимация панели профиля (CSS transition на width)
- [x] Локализация UI на русский язык

### Безопасность и 2FA
- [x] Telegram 2FA — SRP password check через gram.js (`computeCheck`)
- [x] Route: `POST /api/auth/telegram/check-password`
- [x] Frontend: step '2fa' в Login.tsx с формой ввода пароля

### Реакции на сообщения
- [x] DB: таблица `message_reactions` (migration 005)
- [x] API: `POST /:chatId/messages/:messageId/reactions` — toggle
- [x] Socket.io: `message:reaction` event broadcast
- [x] Frontend: optimistic update + revert on error
- [x] Batch-загрузка реакций в GET messages

### Производительность
- [x] Route-level code splitting (React.lazy для Messenger, Settings)
- [x] Component-level code splitting (GroupInfoPanel, PollCreator, GifPicker)
- [x] Vendor chunks (react, socket.io-client, lucide-react, forms)
- [x] Виртуализация сообщений (@tanstack/react-virtual, useVirtualizer)

### Оптимизация бэкенда (03.03.2026)
- [x] **Promise.all параллелизация** — fetchPollData (3 запроса), private chat lookup (2 запроса), friend accept (contacts + 2 user fetch), friend delete, auth register (email + username), poll create (metadata + chat timestamp)
- [x] **Voice channel cache** — in-memory `channelId → chatId` с TTL 5 мин, убрал 5+ DB запросов на каждое voice событие
- [x] **User info cache на socket** — кэшируется при подключении, используется в voice:join/chat:message, call:accept/join/initiate
- [x] **Shared supabase client** — socket/index.ts теперь использует общий клиент из lib/supabase.ts
- [x] **Reverse index для звонков** — `userCallMap` (userId → callId) для O(1) поиска вместо линейного сканирования всех звонков
- [x] **Fire-and-forget** — `chats.update({ updated_at })` при отправке сообщения больше не блокирует ответ
- [x] **Async file I/O** — `fs.promises.readFile` вместо `readFileSync` в upload (не блокирует event loop)
- [x] **Static import supabase** — upload.ts использует static import вместо dynamic `await import()` на каждый запрос
- [x] **SELECT * → SELECT columns** — auth login, telegram sign-in/check-password, sessions refresh, polls — запрашиваются только нужные колонки
- [x] **Database indexes** — миграция `007_performance_indexes.sql`: 12 индексов для messages, chat_participants, message_reactions, message_reads, friend_requests, poll_votes, sessions, voice_channel_participants

### Баг-фиксы
- [x] Реалтайм сообщения не доставлялись (leaveChat удалял из комнаты)
- [x] Звук уведомлений не воспроизводился (AudioContext suspended)
- [x] Stale closure currentUserId в useSocket
- [x] `/read` возвращал 500 (graceful try/catch)
- [x] Случайные logout (ротация refresh token)
- [x] tokenStorage не очищался при logout
- [x] ContactPicker: API возвращал `{ friends: [...] }`, а не массив
- [x] Профиль открывался два раза (Sheet portal + inline)
- [x] Chat scroll: прокрутка в середину вместо конца
- [x] MicrophoneSelector вместо простой кнопки микрофона
- [x] Звонок-иконка в групповых чатах (теперь только в приватных)
- [x] Emoji-пикер не работал (onClick не был подключён)
- [x] Панель профиля дёргалась (заменён animation на CSS transition)
- [x] GIF-пикер через Tenor API (вместо выбора файлов)
- [x] Локализация страницы входа на русский язык
- [x] Улучшенный empty state на экране выбора чата
- [x] Бэкенд: сообщения возвращались в порядке создания (старые первые) — исправлено на newest-first
- [x] Scroll to bottom: setTimeout(100) заменён на двойной rAF + ожидание загрузки сообщений
- [x] Сообщения пропадали после перезагрузки — бэкенд теперь корректно возвращает последние 50
- [x] Голосовые настройки перемещены из модального окна в отдельную вкладку Settings
- [x] Discord-style панель участников голосового канала в основной области (не dropdown)
- [x] Кнопка настроек в голосовой вкладке теперь ведёт на страницу Settings
- [x] Socket reconnect теперь перезагружает список чатов (loadChats) помимо сообщений
- [x] Профиль группы: private чаты показывают только Медиа/Файлы/Ссылки (без Участники/Голос)
- [x] Серверные обработчики звонков (call:initiate/accept/reject/signal/end)
- [x] Busy detection при звонках + 30с таймаут для private
- [x] Опросы: подгрузка pollData при GET messages (сервер)
- [x] Опросы: фикс poll:update handler (messageId → pollId)
- [x] Сообщения не скукоживаются (убран contain-content, добавлен min-w-0)
- [x] Плавные анимации отправки/получения (Telegram-style, без bounce)
- [x] Scroll: двойной rAF вместо setTimeout для надёжной прокрутки + fix savedScrollPositions
- [x] Telegram-style визуал опросов (radio/checkbox до голосования, progress bars после)
- [x] Профили: фикс медиа/файлы/ссылки (отдельные fileMessages state, корректная загрузка)
- [x] Voice channels: кнопка создания канала в групповом профиле (GroupInfoPanel)
- [x] Наложение времени на текст в сообщениях (увеличен min-width, padding, spacer)
- [x] Навигация в голосовой канал из GroupInfoPanel (setViewingChannel + onChannelJoined callback)
- [x] Кастомные разделы голосовых каналов: создание, переименование, удаление, изменение приоритета
- [x] Бэкенд: PATCH /categories/rename, POST /categories/delete, PATCH /categories/reorder
- [x] Socket.IO: joinUserToRoom двойной `chat:` префикс — новые чаты не получали реалтайм сообщения
- [x] Socket.IO: reconnectionAttempts 10→Infinity — сокет больше не умирает навсегда
- [x] Socket.IO: useSocket не отключает сокет при рефреше токена (updateAuth вместо disconnect)
- [x] Socket.IO: auto-refresh JWT при connect_error — сокет сам обновляет токен при истечении
- [x] "2 участника" в приватных чатах — GroupInfoPanel показывал "Группа · N участников" для private чатов; добавлен guard `!isPrivateChat`
- [x] Панель профиля накладывалась на панель группы — handleGroupInfo/handleAvatarClick теперь закрывает противоположную панель перед открытием
- [x] Панели не закрывались при переключении чатов — useEffect на activeChat?.id закрывает оба: groupInfoOpen + profileOpen
- [x] Чат не открывался с первого клика — `chatReadyRef` (ref) не вызывал ре-рендер → `opacity-0` оставалась навсегда. Добавлен `chatReady` state рядом с ref
- [x] Race condition при handleBack на мобильных — delayed `setActiveChat(null)` перезаписывал новый чат. Добавлен `clearTimeout` в useEffect на `activeChat`
- [x] Профиль пользователя не закрывался при смене чата — `prevActiveChatRef` обновлялся до проверки условия. Перенесено присвоение после проверки
- [x] Картинка обрезалась в MediaViewer — заменён `max-h-[calc(100vh-140px)]` на `max-h-[calc(100dvh-60px)]` + добавлены `w-auto h-auto`
- [x] Сообщения начинались сверху — добавлен `flex flex-col justify-end` + `minHeight: 100%` на обёртку сообщений

### Read receipts + Конфиденциальность (06.03.2026)
- [x] Telegram-style read receipts — бэкенд GET messages возвращает `status: 'read'` через проверку message_reads
- [x] markAsRead помечает ВСЕ сообщения до точки прочтения (не только одно)
- [x] readReceipts store — `Record<string, ReadReceipt[]>`, updateReadReceipt, setReadReceipts
- [x] Real-time read receipts — socket `message:read` event обновляет readReceipts store + markAsRead
- [x] Гидрация статусов при загрузке чата — Promise.all([loadMessages, getReadReceipts])
- [x] "Кто прочитал" в контекстном меню — аватарки в ряд (группы), "Прочитано HH:MM" (ЛС), клик раскрывает список
- [x] Контекстное меню на всю строку — onContextMenu на outermost virtualizer div
- [x] Last seen tracking — socket обновляет users.last_seen + is_online при connect/disconnect
- [x] Privacy settings API — GET/PUT `/api/users/me/privacy`, JSONB колонка `privacy_settings`
- [x] Privacy settings UI — русский язык, 3 Select + 1 Switch (отчёты о прочтении)
- [x] Read receipts privacy — отключение блокирует отправку read events
- [x] Миграция 008_privacy_settings.sql — ALTER TABLE users ADD COLUMN privacy_settings JSONB
