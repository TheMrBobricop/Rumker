# 🚀 Настройка Supabase для Rumker Messenger

## 📋 Что нужно сделать:

### 1. Создание проекта Supabase
1. Перейди на [supabase.com](https://supabase.com)
2. Войди через GitHub/Google
3. Нажми "New Project"
4. Выбери организацию (или создай новую)
5. Настрой проект:
   - **Project Name:** `rumker-messenger`
   - **Database Password:** создай надежный пароль
   - **Region:** выбери ближайший регион
   - **Project pricing tier:** Free (для начала)

### 2. Получение учетных данных
После создания проекта перейди в:
- **Project Settings** → **API**
- Скопируй:
  - **Project URL** (https://xxx.supabase.co)
  - **anon public** key
  - **service_role** key (секретный!)

### 3. Настройка базы данных
#### Способ A: Через SQL Editor
1. Перейди в **SQL Editor**
2. Нажми "New query"
3. Скопируй и вставь содержимое файлов миграций по порядку:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/007_performance_indexes.sql`
   - `supabase/migrations/008_privacy_settings.sql`
4. Нажми "Run" для выполнения каждой миграции

#### Способ B: Через Prisma (рекомендуется)
```bash
# Установи Supabase CLI
npm install -g supabase

# Войди в Supabase
supabase login

# Ссылка на проект
supabase link --project-ref your-project-id

# Примени миграции
supabase db push
```

### 4. Обновление .env файла
Добавь в `.env`:
```bash
# Supabase Configuration
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-anon-key-here"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
SUPABASE_DATABASE_URL="postgresql://postgres:[password]@db.your-project-id.supabase.co:5432/postgres"
```

### 5. Установка зависимостей
```bash
npm install @supabase/supabase-js
```

### 6. Переключение на Supabase роуты
В `server/routes/index.ts` замени:
```typescript
// Было:
import usersRouter from './users.js';
// Стало:
import usersRouter from './users_supabase.js';
```

### 7. Генерация Prisma клиента
```bash
npx prisma generate
npx prisma db push
```

### 8. Запуск сервера
```bash
npm run server
```

## 🔧 Проверка работы

### Тест подключения к Supabase:
```bash
# В server/lib/supabase.ts добавь тест:
console.log('Supabase URL:', process.env.SUPABASE_URL);
```

### Тест API эндпоинтов:
```bash
# Проверь поиск пользователей
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/users/search?query=test
```

## 🚨 Важные моменты:

### Безопасность:
- **НИКОГДА** не публикуй `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` безопасен для frontend
- Используй Row Level Security (RLS) политики

### Производительность:
- Supabase имеет лимиты на бесплатном тарифе
- Мониторь использование в Dashboard
- Оптимизируй запросы с индексами

### Бэкап данных:
- Supabase автоматически бэкапит данные
- Экспортируй данные перед важными изменениями
- Храни локальные копии важных данных

## 🔄 Миграция существующих данных:

### Из SQLite в Supabase:
```bash
# Экспорт из SQLite
npm run db:export

# Импорт в Supabase (через CSV или SQL)
# Используй Supabase Dashboard → Table Editor
```

### Скрипт миграции:
```typescript
// server/scripts/migrate-to-supabase.ts
import { PrismaClient } from '@prisma/client';
import { supabase } from '../lib/supabase.js';

const prisma = new PrismaClient();

async function migrateUsers() {
  const users = await prisma.user.findMany();
  
  for (const user of users) {
    await supabase.from('users').insert({
      username: user.username,
      email: user.email,
      password: user.password,
      first_name: user.firstName,
      last_name: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      phone: user.phone,
      last_seen: user.lastSeen,
      is_online: user.isOnline
    });
  }
}

migrateUsers().then(() => console.log('Migration complete!'));
```

## 🎯 Преимущества Supabase:

1. **Реалтайм** - мгновенные обновления
2. **Автоскалирование** - растет с твоим проектом
3. **Безопасность** - встроенные RLS политики
4. **API** - готовые REST и GraphQL API
5. **Dashboard** - удобная админка
6. **Бэкапы** - автоматические бэкапы

## 📞 Поддержка:

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.gg/supabase)
- [GitHub Issues](https://github.com/supabase/supabase/issues)

---

**Готово!** После этих шагов твой проект будет работать с Supabase PostgreSQL вместо SQLite.
