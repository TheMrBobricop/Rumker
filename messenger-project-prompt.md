# Промпт для Claude Opus 4.5: Разработка веб-мессенджера

## 📋 Общее описание проекта

Создай полнофункциональный веб-мессенджер с визуальным дизайном в стиле Telegram, готовый к интеграции с Telegram Bot API. Проект должен быть безопасным, производительным и полностью кастомизируемым.

---

## 🎯 Фаза 1: Инициализация проекта и настройка окружения

### 1.1 Создание базовой структуры
```bash
# Инициализация проекта
npm create vite@latest messenger-app -- --template react-ts
cd messenger-app
npm install

# Установка shadcn/ui
npx shadcn@latest init

# Установка необходимых зависимостей
npm install socket.io-client lucide-react date-fns zustand
npm install -D @types/node
```

### 1.2 Структура файлов
```
messenger-app/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   ├── settings/
│   │   ├── media/
│   │   └── ui/ (shadcn components)
│   ├── lib/
│   │   ├── cache/
│   │   ├── security/
│   │   └── api/
│   ├── stores/
│   ├── types/
│   └── styles/
├── server/
│   ├── routes/
│   ├── middleware/
│   ├── database/
│   └── socket/
└── shared/
    └── types/
```

### 1.3 Конфигурация
- Настроить TypeScript с strict mode
- Настроить ESLint и Prettier
- Настроить Tailwind CSS с темой в стиле Telegram
- Создать файл конфигурации для цветовой схемы Telegram

---

## 🔒 Фаза 2: Безопасность и защита от SQL-инъекций

### 2.1 Backend безопасность
```typescript
// Создай систему защиты от SQL-инъекций:
// - Используй параметризованные запросы (prepared statements)
// - Установи pg (PostgreSQL) или лучше Prisma ORM
// - Все входные данные валидируй через библиотеку zod

// Пример middleware для валидации:
import { z } from 'zod';

const messageSchema = z.object({
  text: z.string().max(4096).trim(),
  chatId: z.string().uuid(),
  userId: z.string().uuid()
});
```

### 2.2 Дополнительные меры безопасности
- JWT токены для аутентификации
- Rate limiting (express-rate-limit)
- Helmet.js для HTTP headers
- CORS настройка
- XSS защита
- CSRF токены для форм

---

## 💾 Фаза 3: Система кэширования медиа

### 3.1 Клиентское кэширование (IndexedDB)
```typescript
// Создай класс MediaCacheManager:
class MediaCacheManager {
  private db: IDBDatabase;
  
  async cacheMedia(file: Blob, fileId: string, type: 'image' | 'video'): Promise<void>
  async getMedia(fileId: string): Promise<Blob | null>
  async clearCache(): Promise<void>
  async getCacheSize(): Promise<number>
  async removeLRU(): Promise<void> // Least Recently Used
}

// Настройки кэша:
interface CacheSettings {
  maxSize: number; // в MB
  autoClean: boolean;
  cacheVideos: boolean;
  cacheImages: boolean;
  expirationDays: number;
}
```

### 3.2 Оптимизация загрузки
- Lazy loading для изображений
- Progressive loading для видео
- Thumbnails для предпросмотра
- Compression перед кэшированием
- Service Worker для offline доступа

---

## 🎨 Фаза 4: UI/UX дизайн в стиле Telegram

### 4.1 Цветовая схема Telegram
```typescript
// tailwind.config.js
const telegramTheme = {
  colors: {
    'tg-primary': '#2AABEE',
    'tg-secondary': '#229ED9',
    'tg-bg': '#FFFFFF',
    'tg-bg-dark': '#0E1621',
    'tg-message-out': '#EFFDDE',
    'tg-message-in': '#FFFFFF',
    'tg-text': '#000000',
    'tg-text-secondary': '#707579',
    'tg-divider': '#E4E4E4',
  }
}
```

### 4.2 Основные компоненты shadcn/ui
```bash
# Установи необходимые компоненты:
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add avatar
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add scroll-area
npx shadcn@latest add tabs
npx shadcn@latest add switch
npx shadcn@latest add slider
npx shadcn@latest add popover
```

### 4.3 Создай компоненты интерфейса
- **ChatList** - список чатов с превью последнего сообщения
- **ChatWindow** - окно чата с сообщениями
- **MessageBubble** - пузырь сообщения (входящее/исходящее)
- **MessageInput** - поле ввода с кнопками медиа
- **MediaViewer** - просмотрщик фото/видео
- **VoiceRecorder** - запись голосовых сообщений

---

## ⚙️ Фаза 5: Система настроек

### 5.1 Личный кабинет (Profile Settings)
```typescript
interface UserProfile {
  id: string;
  username: string;
  firstName: string;
  lastName?: string;
  bio?: string;
  avatar?: string;
  phone?: string;
}

// Компонент должен открываться сразу при клике на Settings
// Как в Telegram - без дополнительных переходов
```

### 5.2 Настройки чата
```typescript
interface ChatAppearanceSettings {
  // Фон чата
  chatBackground: {
    type: 'color' | 'image' | 'gradient';
    value: string;
    opacity: number;
  };
  
  // Сообщения
  messageBubbles: {
    borderRadius: number; // 0-20px
    fontSize: number; // 12-20px
    outgoingColor: string;
    incomingColor: string;
  };
  
  // Общее
  theme: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  showAvatars: boolean;
  showTimeStamps: boolean;
}
```

### 5.3 Настройки кэша (в разделе Settings)
```typescript
interface CacheSettingsUI {
  maxCacheSize: number; // Slider 100MB - 5GB
  autoClearEnabled: boolean;
  cacheImages: boolean;
  cacheVideos: boolean;
  clearCacheOnExit: boolean;
  currentCacheSize: number; // Display only
}

// Кнопки действий:
// - Очистить кэш
// - Очистить кэш этого чата
// - Посмотреть статистику кэша
```

### 5.4 Структура меню настроек
```
Settings
├── Profile (Personal Cabinet) ← Открывается сразу
│   ├── Avatar upload
│   ├── Username
│   ├── Bio
│   └── Phone
├── Chat Appearance
│   ├── Background
│   ├── Message bubbles
│   └── Font size
├── Notifications
├── Privacy & Security
├── Data & Storage
│   └── Cache Settings ← Здесь
└── Advanced
```

---

## 💬 Фаза 6: Функционал сообщений

### 6.1 Типы сообщений
```typescript
type MessageType = 
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'sticker'
  | 'file'
  | 'reply'
  | 'forward';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  mediaMetadata?: {
    duration?: number;
    size: number;
    mimeType: string;
    thumbnail?: string;
  };
  replyTo?: string;
  timestamp: Date;
  isRead: boolean;
  isEdited: boolean;
}
```

### 6.2 Отправка медиа
```typescript
// Компонент MediaUploader:
// - Drag & drop зона
// - Превью перед отправкой
// - Компрессия изображений (browser-image-compression)
// - Ограничение размера файлов
// - Поддержка множественной загрузки

// Кнопки в MessageInput:
// - 📎 Attach file
// - 🖼️ Image/Video
// - 🎤 Voice message
// - 😊 Stickers
```

### 6.3 Голосовые сообщения
```typescript
// Используй MediaRecorder API:
class VoiceRecorder {
  async startRecording(): Promise<void>
  stopRecording(): Promise<Blob>
  pauseRecording(): void
  resumeRecording(): void
  cancelRecording(): void
  
  // Визуализация:
  // - Waveform в реальном времени
  // - Таймер записи
  // - Кнопки: пауза, отмена, отправить
}
```

### 6.4 Стикеры
```typescript
// Структура стикер-пака:
interface StickerPack {
  id: string;
  name: string;
  author: string;
  stickers: Sticker[];
  thumbnail: string;
}

interface Sticker {
  id: string;
  emoji: string;
  imageUrl: string;
  packId: string;
}

// Функционал:
// - Grid view стикеров
// - Избранные стикеры
// - Недавно использованные
// - Поиск по emoji
// - Импорт стикер-паков из Telegram (через .tgs конвертер)
```

---

## 🔌 Фаза 7: Real-time коммуникация (WebSocket)

### 7.1 Socket.io настройка
```typescript
// Client:
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: userToken },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// События:
socket.on('message:new', handleNewMessage);
socket.on('message:read', handleMessageRead);
socket.on('typing:start', handleTypingStart);
socket.on('typing:stop', handleTypingStop);
socket.on('user:online', handleUserOnline);
```

### 7.2 Индикаторы статуса
- Typing indicator (кто-то печатает...)
- Online/Offline статус
- Последняя активность
- Статусы доставки сообщений: sent → delivered → read
- Звук уведомления о новом сообщении

---

## 🔗 Фаза 8: Интеграция с Telegram (подготовка)

### 8.1 Telegram Bot API структура
```typescript
// Создай абстракцию для будущей интеграции:
interface MessengerAdapter {
  sendMessage(chatId: string, text: string): Promise<void>;
  sendMedia(chatId: string, media: File): Promise<void>;
  getUpdates(): Promise<Update[]>;
}

class TelegramAdapter implements MessengerAdapter {
  // Будет реализовано позже через Bot API
}

class WebAdapter implements MessengerAdapter {
  // Текущая реализация через WebSocket
}
```

### 8.2 Unified Data Model
```typescript
// Общая модель данных для обеих платформ:
interface UnifiedMessage {
  id: string;
  platform: 'web' | 'telegram';
  platformMessageId?: number; // для Telegram
  // ... остальные поля
}
```

---

## 🗄️ Фаза 9: База данных (PostgreSQL + Prisma)

### 9.1 Prisma Schema
```prisma
model User {
  id        String   @id @default(uuid())
  username  String   @unique
  firstName String
  lastName  String?
  bio       String?
  avatar    String?
  phone     String?  @unique
  createdAt DateTime @default(now())
  
  messages  Message[]
  chats     ChatParticipant[]
}

model Chat {
  id           String   @id @default(uuid())
  type         ChatType
  title        String?
  avatar       String?
  createdAt    DateTime @default(now())
  
  messages     Message[]
  participants ChatParticipant[]
}

model Message {
  id          String      @id @default(uuid())
  chatId      String
  senderId    String
  type        MessageType
  content     String
  mediaUrl    String?
  replyToId   String?
  createdAt   DateTime    @default(now())
  isRead      Boolean     @default(false)
  isEdited    Boolean     @default(false)
  
  chat        Chat        @relation(fields: [chatId], references: [id])
  sender      User        @relation(fields: [senderId], references: [id])
  replyTo     Message?    @relation("MessageReplies", fields: [replyToId], references: [id])
  replies     Message[]   @relation("MessageReplies")
}

enum ChatType {
  PRIVATE
  GROUP
  CHANNEL
}

enum MessageType {
  TEXT
  IMAGE
  VIDEO
  VOICE
  STICKER
  FILE
}
```

### 9.2 Миграции и seed данные
```bash
npx prisma init
npx prisma migrate dev --name init
npx prisma generate
```

---

## 🎭 Фаза 10: State Management (Zustand)

### 10.1 Store структура
```typescript
// stores/chatStore.ts
interface ChatStore {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>;
  
  setActiveChat: (chat: Chat) => void;
  addMessage: (message: Message) => void;
  markAsRead: (messageId: string) => void;
}

// stores/settingsStore.ts
interface SettingsStore {
  appearance: ChatAppearanceSettings;
  cache: CacheSettings;
  profile: UserProfile;
  
  updateAppearance: (settings: Partial<ChatAppearanceSettings>) => void;
  updateCache: (settings: Partial<CacheSettings>) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
}

// stores/mediaStore.ts
interface MediaStore {
  cachedMedia: Map<string, Blob>;
  cacheSize: number;
  
  cacheMedia: (id: string, blob: Blob) => Promise<void>;
  getMedia: (id: string) => Promise<Blob | null>;
  clearCache: () => Promise<void>;
}
```

---

## 📱 Фаза 11: Адаптивный дизайн

### 11.1 Breakpoints (Telegram-like)
```typescript
// Desktop: > 1024px - 3 колонки (список чатов | чат | инфо панель)
// Tablet: 768-1024px - 2 колонки (список чатов | чат)
// Mobile: < 768px - 1 колонка (навигация между экранами)

// Используй Tailwind responsive prefixes:
// sm: md: lg: xl: 2xl:
```

### 11.2 Mobile navigation
- Bottom navigation bar
- Swipe gestures (react-swipeable)
- Pull-to-refresh в списке чатов
- Виртуализация длинных списков (react-virtual)

---

## 🧪 Фаза 12: Тестирование и оптимизация

### 12.1 Тесты
```bash
# Unit tests
npm install -D vitest @testing-library/react @testing-library/jest-dom

# E2E tests
npm install -D playwright
```

### 12.2 Performance оптимизации
- React.memo для компонентов
- useMemo / useCallback где нужно
- Lazy loading роутов
- Code splitting
- Image optimization (webp, sizes)
- Виртуализация списков сообщений
- Debounce для поиска и typing indicators

### 12.3 Bundle анализ
```bash
npm install -D vite-bundle-visualizer
```

---

## 🚀 Фаза 13: Финальная сборка и деплой

### 13.1 Production build
```bash
# Frontend
npm run build
npm run preview

# Backend
npm run build
NODE_ENV=production npm start
```

### 13.2 Docker containerization
```dockerfile
# Dockerfile для frontend и backend
# docker-compose.yml для всего стека
```

### 13.3 Environment variables
```env
# .env.example
DATABASE_URL=
JWT_SECRET=
SOCKET_PORT=
API_URL=
TELEGRAM_BOT_TOKEN= # для будущей интеграции
```

---

## ✅ Чеклист функционала

### Основные функции
- [ ] Регистрация и аутентификация
- [ ] Список чатов с поиском
- [ ] Приватные чаты 1-на-1
- [ ] Групповые чаты
- [ ] Отправка текстовых сообщений
- [ ] Отправка изображений
- [ ] Отправка видео
- [ ] Голосовые сообщения
- [ ] Стикеры
- [ ] Ответы на сообщения (reply)
- [ ] Редактирование сообщений
- [ ] Удаление сообщений
- [ ] Пересылка сообщений

### Настройки
- [ ] Личный кабинет (профиль)
- [ ] Настройки внешнего вида
- [ ] Фон чата (цвет/изображение/градиент)
- [ ] Закругление сообщений (slider)
- [ ] Размер шрифта (slider)
- [ ] Настройки кэша
- [ ] Темная/светлая тема
- [ ] Язык интерфейса

### Безопасность
- [ ] Защита от SQL-инъекций
- [ ] JWT токены
- [ ] Rate limiting
- [ ] XSS защита
- [ ] CORS настройка
- [ ] Валидация входных данных

### Кэширование
- [ ] IndexedDB для медиа
- [ ] Настраиваемый размер кэша
- [ ] Автоочистка кэша
- [ ] Статистика использования
- [ ] Ручная очистка

### Real-time
- [ ] WebSocket соединение
- [ ] Typing indicators
- [ ] Online/Offline статусы
- [ ] Статусы доставки
- [ ] Уведомления

### UI/UX
- [ ] Адаптивный дизайн
- [ ] Анимации и transitions
- [ ] Drag & drop для файлов
- [ ] Контекстное меню
- [ ] Клавиатурные shortcuts
- [ ] Accessibility (a11y)

---

## 🎨 Дизайн референсы

### Telegram UI элементы для воспроизведения:
1. **Chat list**: компактный вид с аватаром, именем, превью сообщения, временем
2. **Message bubbles**: разные цвета для входящих/исходящих, хвостик, статусы
3. **Message input**: минималистичное поле с иконками действий
4. **Settings menu**: иерархическая структура с иконками
5. **Profile page**: большой аватар вверху, информация блоками
6. **Media viewer**: полноэкранный просмотр с swipe navigation
7. **Voice message**: waveform с кнопкой play, длительность

---

## 📝 Дополнительные рекомендации

1. **Используй TypeScript** строго - никаких `any`
2. **Следуй Telegram UX паттернам** - пользователи уже знакомы с ними
3. **Пиши чистый код** - комментарии, понятные имена переменных
4. **Модульность** - каждый компонент должен быть переиспользуемым
5. **Git commits** - используй conventional commits
6. **Документация** - README с инструкциями по запуску
7. **Accessibility** - aria-labels, keyboard navigation
8. **Производительность** - мониторь через React DevTools

---

## 🔧 Технический стек (финальный)

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zustand (state)
- Socket.io-client
- React Router
- date-fns
- Lucide React (icons)

### Backend
- Node.js + Express
- TypeScript
- Socket.io
- Prisma ORM
- PostgreSQL
- JWT
- Zod (validation)
- Helmet.js
- express-rate-limit

### DevOps
- Docker
- Docker Compose
- Nginx (reverse proxy)
- PM2 (process manager)

---

## 🎯 Порядок выполнения (рекомендуемый)

1. **День 1-2**: Фазы 1-2 (Инициализация + Безопасность)
2. **День 3-4**: Фазы 3-4 (Кэширование + UI/UX)
3. **День 5-6**: Фазы 5-6 (Настройки + Сообщения)
4. **День 7-8**: Фазы 7-9 (WebSocket + Telegram prep + БД)
5. **День 9-10**: Фазы 10-11 (State + Адаптив)
6. **День 11-12**: Фаза 12 (Тестирование)
7. **День 13-14**: Фаза 13 (Деплой + Полировка)

---

## 📚 Полезные ресурсы

- shadcn/ui docs: https://ui.shadcn.com
- Telegram design guidelines: https://telegram.org/blog/android-2-0-design
- Socket.io docs: https://socket.io/docs/v4
- Prisma docs: https://www.prisma.io/docs
- React best practices: https://react.dev

---

**Удачи в разработке! 🚀**
