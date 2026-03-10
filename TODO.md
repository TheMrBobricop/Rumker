# Rumker Messenger — Статус проекта

Последнее обновление: 06.03.2026

---

## Общий прогресс: ~88%

---

## Выполненные задачи

### Инициализация и инфраструктура
- [x] Инициализация проекта (Vite + React 19 + TypeScript)
- [x] TailwindCSS 4 + shadcn/ui
- [x] Express 5 бэкенд с tsx watch
- [x] Prisma ORM + Supabase PostgreSQL
- [x] Структура папок (components, stores, lib, server)
- [x] Vite proxy для `/api`, `/uploads`, `/socket.io`
- [x] Production build: Express раздаёт `dist/`

### Безопасность
- [x] Helmet.js для HTTP заголовков
- [x] CORS настройка
- [x] JWT access (15 мин) + refresh (7 дней) токены
- [x] bcrypt хеширование паролей
- [x] Rate limiting (500 req / 15 мин)
- [x] Zod валидация на эндпоинтах auth
- [x] Fix: refresh token больше не ротируется (исправлен race condition)

### Авторизация
- [x] Регистрация через Email (username обязателен)
- [x] Вход через Email
- [x] Вход через Telegram (gram.js: send-code + sign-in)
- [x] JWT access/refresh flow
- [x] Аккаунт-свитчер на странице логина (сохранённые аккаунты, быстрый вход)
- [x] Очистка tokenStorage при logout

### Чаты и сообщения
- [x] Создание приватных чатов
- [x] Создание групповых чатов и каналов
- [x] Отправка текстовых сообщений (оптимистичное обновление)
- [x] Отправка фото, видео, голосовых, файлов
- [x] Редактирование сообщений
- [x] Удаление сообщений (soft delete)
- [x] Ответы (reply) на сообщения
- [x] Закрепление/открепление сообщений (pin/unpin)
- [x] Поиск по сообщениям в чате
- [x] Shared media (фото/видео/файлы)
- [x] Контекстное меню сообщений
- [x] Drag-and-drop файлов в чат
- [x] Пагинация (infinite scroll вверх)
- [x] Graceful `/read` endpoint (не падает при ошибке DB)

### Реалтайм (Socket.io)
- [x] Socket.io сервер с JWT аутентификацией
- [x] Авто-присоединение ко всем комнатам при подключении
- [x] Доставка сообщений в реальном времени
- [x] Индикаторы "печатает..."
- [x] Онлайн/Оффлайн статусы
- [x] Read receipts (Telegram-style ✓✓, persistent через message_reads, real-time через socket)
- [x] Pin/Unpin в реалтайме
- [x] Fix: пользователь больше не покидает комнаты при переключении чатов
- [x] Fix: stale closure в useSocket (currentUserId)

### Друзья
- [x] API друзей (заявки, принятие, отклонение, удаление)
- [x] Поиск пользователей по username
- [x] UI: вкладки Друзья / Заявки
- [x] Socket.io уведомления о заявках

### Уведомления
- [x] Браузерные push-уведомления
- [x] Звуковые уведомления (Web Audio API)
- [x] Fix: AudioContext.resume() для браузерной политики
- [x] Счётчик непрочитанных в заголовке
- [x] Mute/Unmute чатов

### UI/UX
- [x] Адаптивный дизайн (мобильный + десктоп)
- [x] Slide-анимации на мобильных
- [x] Свайп-назад
- [x] 5 тем-пресетов (Classic, Ocean, Midnight, Rose, Sunset)
- [x] Тёмная / Светлая / Авто тема
- [x] Кастомизация баблов (цвет, скругление, размер шрифта)
- [x] Хвостики сообщений (Bezier curves)
- [x] Emoji-пикер
- [x] Кэш медиа (IndexedDB) с настройками
- [x] Профиль пользователя (боковая панель)
- [x] Telegram-style профили (чистый заголовок, X слева, карандаш справа, tap-to-copy инфо)
- [x] Telegram-style анимации профилей (header-in, item slide-in, section transition)
- [x] Telegram-style анимации чат-листа (staggered fade-in)

---

## Исправлено (27.02.2026)

- [x] **React 19 Maximum update depth exceeded** — заменены все вызовы Zustand-сторов без селектора на явные селекторы. Затронуто 12+ файлов во всех компонентах. Сайт теперь запускается без ошибок.

- [x] **"Нет сообщений" race condition** — добавлен `loadedChatsRef` (Set<string>), "Нет сообщений" показывается только после завершения первой загрузки для конкретного чата.

- [x] **MediaViewer переписан (Telegram-style)** — имя отправителя + время, thumbnail strip снизу, pinch-to-zoom, double-tap zoom, pan при зуме, fullscreen. UserProfilePanel + GroupInfoPanel: onclick на медиа открывает просмотрщик. Исправлена ошибка рендера внутри Sheet-портала (вынесен за пределы content).

- [x] **GroupInfoPanel — поиск участников** — строка поиска скрыта по умолчанию, открывается по кнопке 🔍, закрывается крестиком.

---

## Выполнено (06.03.2026)

- [x] **Telegram-style read receipts** — двойная галочка (✓✓) на прочитанных сообщениях. Бэкенд возвращает `status: 'read'` из `message_reads` таблицы. Real-time через `message:read` socket event. Persistent — сохраняется между перезаходами
- [x] **Кто прочитал (контекстное меню)** — Telegram-style: в личных чатах "Прочитано HH:MM", в группах — аватарки прочитавших в ряд, клик раскрывает список с именами и временем
- [x] **Контекстное меню на всю строку** — правый клик в любом месте строки сообщения (не только на баббле) открывает меню
- [x] **Last seen** — сокет обновляет `last_seen` и `is_online` в БД при подключении/отключении
- [x] **Настройки конфиденциальности** — `users.privacy_settings` JSONB колонка. API: GET/PUT `/api/users/me/privacy`. UI: Последний визит, Фото профиля, Номер телефона (Все/Контакты/Никто) + переключатель Отчёты о прочтении
- [x] **Read receipts privacy** — если пользователь отключает отчёты о прочтении, клиент не отправляет read events

---

## В процессе / Нужно протестировать

- [ ] **Telegram синхронизация** — доработать получение истории диалогов через gram.js
- [x] **2FA** — UI для ввода пароля 2FA при входе через Telegram
- [ ] **Upload в Supabase Storage** — проверить bucket `chat-media`, RLS-политики

---

## Бэклог

### Высокий приоритет
- [ ] **Пересылка сообщений (forward)** — UI есть частично, бэкенд не реализован
- [x] **Реакции на сообщения** — DB + API + Socket.io + фронтенд (toggle, optimistic update)
- [x] **Code splitting** — React.lazy() для Settings, Messenger, GroupInfoPanel, PollCreator, GifPicker + manualChunks (react, socket.io, lucide, forms)
- [x] **Виртуализация списков** — @tanstack/react-virtual для списка сообщений (useVirtualizer, measureElement, overscan)

### Средний приоритет
- [ ] **Стикеры** — загрузка и отправка стикер-паков
- [ ] **Service Worker** — offline доступ к кэшированным сообщениям
- [ ] **Pull-to-refresh** — обновление списка чатов свайпом вниз

### Низкий приоритет
- [ ] **End-to-end шифрование** — для приватных чатов
- [ ] **Каналы** — расширенный функционал (подписчики, статистика)
- [ ] **Адаптивность для планшетов** — iPad breakpoint
- [ ] **Accessibility (a11y)** — aria-labels, фокус-менеджмент

---

## Технический долг

- [ ] **Удалить дублирование** — `chats.ts` vs `chats_supabase.ts`, `users.ts` vs `users_supabase.ts`
- [ ] **Zod на всех эндпоинтах** — сейчас только auth, нужно на chats/friends/users
- [ ] **Тесты** — unit для API, интеграционные для auth flow
- [ ] **CI/CD** — GitHub Actions (lint + build + тесты)
- [ ] **ENV validation** — проверка обязательных переменных при старте
- [ ] **Docker** — Dockerfile + docker-compose
- [ ] **Nginx** — reverse proxy для production

---

## Исправленные баги (Changelog)

### 17.02.2026
- **Fix: сообщения не приходили в реалтайме** — `ChatWindow` вызывал `leaveChat()` при переключении чатов, убирая пользователя из Socket.io комнаты. Удалён `leaveChat`.
- **Fix: звук уведомлений не воспроизводился** — `AudioContext` создавался в `suspended` состоянии. Добавлен вызов `.resume()`.
- **Fix: stale closure в useSocket** — `currentUserId` захватывался один раз при маунте. Заменён на `getMyId()` из store.
- **Fix: `/read` возвращал 500** — upsert в `message_reads` обёрнут в try/catch, теперь всегда возвращает 200.
- **Fix: случайные logout** — `/refresh` больше не ротирует refresh token. Выдаёт только новый accessToken.
- **Fix: tokenStorage не очищался** — `logout()` теперь вызывает `tokenStorage.clear()`.
- **Feature: аккаунт-свитчер** — сохранённые аккаунты на странице входа с быстрым логином.

### 19.02.2026
- **Feature: Telegram-style меню вложений** — popup-меню при нажатии скрепки с 7 пунктами (Фото/Видео, Документ, Опрос, Геолокация, Контакт, Стикер, GIF).
- **Feature: Опросы** — полный CRUD: создание, голосование, закрытие; реалтайм обновление через Socket.io (`poll:update`). БД: таблицы `polls`, `poll_options`, `poll_votes`.
- **Feature: Геолокация** — отправка текущих координат, отображение в пузыре с ссылкой на Google Maps.
- **Feature: Контакт** — выбор друга для шаринга, отображение в пузыре с кнопкой "Написать".
- **Feature: Голосовые каналы** — вкладка "Голос" в сайдбаре, WebRTC аудио через VoiceChannelPeerManager, VAD, mute/deafen.
- **Feature: metadata JSONB** — расширяемые данные в сообщениях (location, contact) через metadata колонку.

### 20.02.2026
- **Feature: Telegram 2FA** — при входе через Telegram с включённой 2FA показывается поле ввода пароля. Бэкенд: `checkPassword()` через gram.js SRP (`computeCheck`). Роут: `POST /api/auth/telegram/check-password`.
- **Feature: Реакции на сообщения** — toggle emoji на сообщениях. DB: таблица `message_reactions` (migration 005). API: `POST /:chatId/messages/:messageId/reactions`. Socket.io: `message:reaction` event. Фронтенд: optimistic update с revert on error.
- **Feature: Code splitting** — route-level (`React.lazy` для Messenger, Settings) + component-level (GroupInfoPanel, PollCreator, GifPicker) + vendor chunks (react, socket.io-client, lucide-react, forms) в `vite.config.ts`.
- **Feature: Виртуализация сообщений** — `@tanstack/react-virtual` в ChatWindow. Flat-массив `VirtualItemData` (date-separator, unread-divider, message). `useVirtualizer` с `measureElement`, `overscan: 15`. DOM рендерит ~30 элементов вместо всех.

### 01.03.2026
- **Redesign: Telegram-style UserProfilePanel** — убран градиентный заголовок, заменён на чистый `bg-card`. Кнопка закрытия (X) перенесена влево, карандаш редактирования — вправо. Удалена вкладка "Инфо" — информация (телефон, юзернейм, о себе) всегда видна как Telegram-style список с tap-to-copy. Кнопки действий (Написать, Добавить в группу) переделаны в полноширинные строки. Удалены отдельные кнопки ID/Copy/@username.
- **Redesign: Telegram-style GroupInfoPanel** — убран градиент, X слева, карандаш справа. Аватар с тематическим fallback. Поле редактирования названия использует цвета темы.
- **Fix: "2 участника" в ЛС** — GroupInfoPanel показывал "Группа · N участников" для приватных чатов. Добавлен guard `{!isPrivateChat && ...}` вокруг подзаголовка.
- **Fix: панель профиля накладывалась на панель группы** — `handleGroupInfo` и `handleAvatarClick` теперь закрывают противоположную панель (`setGroupInfoOpen(false)` / `setProfileOpen(false)`) перед открытием новой.
- **Fix: панели не закрывались при переключении чатов** — `useEffect` на `activeChat?.id` в ChatWindow закрывает оба: `groupInfoOpen` + `profileOpen` при смене чата.
- **Animations: Telegram-style анимации профилей** — новые CSS keyframes: `profile-header-in` (scale+fade заголовка), `profile-item-in` (slide-from-right для инфо-строк с staggered delay), `profile-section-in` (slide-up для переключения вкладок медиа/файлы/ссылки). Применены к UserProfilePanel и GroupInfoPanel.
- **Animations: Telegram-style анимации чат-листа** — новый keyframe `chat-item-in` (fade + translateY). Применён к каждому элементу ChatList со staggered delay (30ms × index, первые 20 элементов).

### 06.03.2026
- **Feature: Telegram-style read receipts** — бэкенд GET messages возвращает `status: 'read'` из `message_reads` таблицы. `markAsRead` помечает ВСЕ сообщения до отметки прочтения. Persistent между перезаходами.
- **Feature: "Кто прочитал" в контекстном меню** — в ЛС: "Прочитано HH:MM" с синей ✓✓; в группах: аватарки в ряд + клик раскрывает полный список.
- **Feature: Контекстное меню на всю строку** — правый клик в любом месте строки сообщения открывает меню.
- **Feature: Last seen tracking** — сокет обновляет `last_seen` + `is_online` в БД при connect/disconnect.
- **Feature: Настройки конфиденциальности** — JSONB `privacy_settings` в users, API GET/PUT, UI на русском с 4 настройками.
- **Feature: Read receipts privacy** — отключение отчётов о прочтении в настройках блокирует отправку read events.
