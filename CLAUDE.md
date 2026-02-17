# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rumker Messenger — a private messaging app with Telegram integration. Monolithic repo with a React frontend and Express backend both under `messenger-app/`.

## Commands

All commands run from `messenger-app/`:

```bash
cd messenger-app

# Development
npm run dev:full          # Start frontend (Vite :5173) + backend (Express :3000) concurrently
npm run dev               # Frontend only
npm run server            # Backend only (tsx watch, auto-reloads)

# Build & Quality
npm run build             # TypeScript check + Vite production build
npm run lint              # ESLint
npm run format            # Prettier write
npm run format:check      # Prettier check

# Database
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:migrate    # Create and apply migrations
```

## Architecture

### Frontend (`messenger-app/src/`)
- **React 19 + TypeScript** with Vite, TailwindCSS 4, shadcn/ui (Radix)
- **Routing**: React Router v7 — `/login`, `/` (messenger), `/settings`
- **State**: Zustand stores in `src/stores/` — `authStore`, `chatStore`, `settingsStore`, `mediaStore`
- **API client**: Singleton in `src/lib/api/client.ts` — handles Bearer token auth, refresh, and error wrapping via `ApiError` class
- **Path alias**: `@/*` → `./src/*`

### Backend (`messenger-app/server/`)
- **Express 5** with TypeScript (run via `tsx watch`)
- **Auth**: JWT access tokens (15min) + refresh tokens (7 days) stored as httpOnly cookies; bcrypt password hashing
- **Routes**: `/api/auth/*`, `/api/chats/*`, `/api/friends/*`, `/api/users/*` — defined in `server/routes/`
- **Middleware**: JWT verification in `server/middleware/auth.ts` (`authenticateToken`)
- **Telegram**: gram.js integration in `server/services/telegram.ts` for auth and message sync
- **Validation**: Zod schemas on API endpoints

### Database
- **Prisma ORM** — schema at `messenger-app/prisma/schema.prisma`
- PostgreSQL (Supabase) configured via `SUPABASE_DATABASE_URL` env var; SQLite `prisma/dev.db` available for local dev
- Key models: `User`, `Chat`, `ChatParticipant`, `Message`, `MessageRead`, `Session`, `FriendRequest`, `Contact`

### Real-time
- Socket.io client imported but server-side implementation is still placeholder (see `server/socket/`)

## Environment Variables

Configured in `messenger-app/.env` (see `.env.example`):
- `SUPABASE_DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — signing key for tokens
- `VITE_API_URL` — API base URL (default: `http://localhost:3000/api`)
- `TELEGRAM_BOT_TOKEN` — for Telegram integration

## Key Patterns

- Vite dev server proxies `/api` requests to `http://localhost:3000` — backend must be running
- Frontend auth flow: login → store token in Zustand (persisted to localStorage) → attach as `Authorization: Bearer` header
- Dual database support: Supabase routes (`*_supabase.ts`) exist alongside standard Prisma routes
- Media caching uses IndexedDB via `src/lib/cache/`
- TODO/project status tracked in `TODO.md` (in Russian)
