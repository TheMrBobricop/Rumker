# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rumker Messenger — a private messaging app with Telegram integration. Monolithic repo with a React frontend and Express backend both under `messenger-app/`.

## Commands

All commands run from `messenger-app/`:

```bash
cd messenger-app

# Development
npm run dev:full          # Start frontend (Vite :5173) + backend (Express :8080) concurrently
npm run dev               # Frontend only
npm run server            # Backend only (tsx watch, auto-reloads)

# Build & Quality
npm run build             # TypeScript check + Vite production build
npm run lint              # ESLint
npm run format            # Prettier write
npm run format:check      # Prettier check

# Production
npm run start:win         # Start production server (Windows)
npm run deploy            # Build + start production

# Database
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:migrate    # Create and apply migrations
```

## Architecture

### Frontend (`messenger-app/src/`)
- **React 19 + TypeScript** with Vite, TailwindCSS 4, shadcn/ui (Radix)
- **Routing**: React Router v7 — `/login`, `/` (messenger), `/settings`
- **State**: Zustand stores in `src/stores/` — `authStore`, `chatStore`, `settingsStore`, `mediaStore`, `callStore`, `voiceChannelStore`
- **API client**: Singleton in `src/lib/api/client.ts` — handles Bearer token auth, auto-refresh on 401/403, error wrapping via `ApiError` class
- **Socket.io client**: `src/lib/socket.ts` (SocketService singleton) + `src/lib/hooks/useSocket.ts` (wires events to store)
- **Path alias**: `@/*` → `./src/*`

### Backend (`messenger-app/server/`)
- **Express 5** with TypeScript (run via `tsx watch`)
- **Auth**: JWT access tokens (15 min) + refresh tokens (7 days); refresh does NOT rotate tokens (prevents race conditions)
- **Routes**: `/api/auth/*`, `/api/chats/*`, `/api/friends/*`, `/api/users/*`, `/api/polls/*`, `/api/voice-channels/*` — defined in `server/routes/`
- **Privacy**: `GET/PUT /api/users/me/privacy` — per-user privacy settings stored as JSONB in `users.privacy_settings`
- **Middleware**: JWT verification in `server/middleware/auth.ts` (`authenticateToken`)
- **Socket.io**: Full implementation in `server/socket/index.ts` — JWT auth on handshake, auto-join all chat rooms, typing, read receipts, online status, `last_seen`/`is_online` DB updates on connect/disconnect
- **Telegram**: gram.js integration in `server/services/telegram.ts` for auth and message sync
- **Validation**: Zod schemas on API endpoints (auth routes)

### Database
- **Supabase** (PostgreSQL) — configured via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- **Prisma ORM** — schema at `messenger-app/prisma/schema.prisma`
- Key tables: `users`, `chats`, `chat_participants`, `messages`, `message_reads`, `message_reactions`, `sessions`, `friend_requests`, `polls`, `poll_options`, `poll_votes`, `voice_channels`
- Messages have `metadata JSONB` column for extensible data (location coords, contact info)
- `users` table has `privacy_settings JSONB` column for per-user privacy (lastSeen, profilePhoto, phoneNumber visibility + readReceipts toggle)
- `users` table has `is_online BOOLEAN` and `last_seen TIMESTAMPTZ` — updated by socket connect/disconnect

### Real-time
- **Socket.io** server attached to HTTP server in `server/index.ts`
- Server auto-joins users to all their chat rooms on connect
- **Important**: Client must NOT call `leaveChat()` when switching between chats — users stay in all rooms permanently
- Events: `message:new`, `message:edit`, `message:delete`, `message:read`, `message:pin`, `message:unpin`, `message:reaction`, `typing:start/stop`, `user:online`, `friend:request/accepted/rejected`, `poll:update`
- Call events: `call:initiate/accept/reject/leave/signal/toggle-mute/toggle-deafen`, broadcasts `call:deafen-changed`
- Voice channel events: `voice:join/leave/mute/deafen/speaking`, `voice:offer/answer/ice-candidate`, `voice:user:joined/left/updated/speaking`

### WebRTC
- **PeerManager** (`src/lib/webrtc/PeerManager.ts`) — full-featured peer manager for 1-on-1 and group calls (audio + video + screen share), binds to `callStore`. Includes Opus SDP munging (64kbps, stereo, FEC), connection quality monitoring (RTT/packet loss/bitrate), and deafen support
- **VoiceChannelPeerManager** (`src/lib/webrtc/VoiceChannelPeerManager.ts`) — simplified audio-only peer manager for voice channels, binds to `voiceChannelStore`
- Both use STUN + TURN servers (Google STUN + openrelay.metered.ca TURN), handle offer/answer/ICE signaling via Socket.io, apply Opus SDP munging for better audio quality

### Message Types
- Standard: `text`, `image`, `video`, `voice`, `sticker`, `file`, `reply`, `forward`
- Extended: `poll` (uses `polls`/`poll_options`/`poll_votes` tables), `location` (metadata JSONB), `contact` (metadata JSONB)

## Environment Variables

Configured in `messenger-app/.env`:
- `PORT` — Express server port (default: 8080)
- `JWT_SECRET` — signing key for tokens
- `VITE_CLIENT_URL` — frontend URL for CORS
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `SUPABASE_DATABASE_URL` — PostgreSQL connection string
- `TELEGRAM_API_ID` — Telegram API ID for gram.js
- `TELEGRAM_API_HASH` — Telegram API Hash for gram.js

### UI Architecture
- **Profile panels**: Desktop uses inline `<div>` with CSS transition on width (420px ↔ 0px) for smooth open/close. Mobile uses Sheet (portal-based overlay). Controlled by `isDesktop` state in `ChatWindow.tsx`
- **Voice channels**: Accessible via "Голос" tab in `GroupInfoPanel` and "Голос" main tab in `Messenger.tsx`. `VoiceChannelOverlay` at bottom of sidebar. `VoiceChannelPanel` shows Discord-style participant grid in the main area when a channel is selected. Voice settings in `/settings` (VoiceSettings component). `viewingChannel` state in `voiceChannelStore` controls which view (chat vs voice panel) the main area shows
- **Message input**: Telegram Web-style layout — paperclip inside left, emoji inside right, mic/send button outside right. Voice recording via `MediaRecorder` API
- **GIF picker**: Uses Tenor API v2 (`tenor.googleapis.com/v2`). Component: `src/components/chat/GifPicker.tsx`. Sends GIF URL as `type: 'image'`
- **Attachment menu**: `src/components/chat/AttachmentMenu.tsx` — 7 items: Photo/Video, Document, Poll, Location, Contact, Sticker, GIF
- **Pinned messages**: Telegram-style segmented bar with vertical indicators. Component: `PinnedMessageBar.tsx`
- **Call overlay**: Discord-style draggable/resizable/dockable window (`ActiveCallOverlay.tsx`). Uses `createPortal` to render on `document.body`. Supports float (drag+resize), dock to edges (left/right/top/bottom at 50%), and fullscreen (double-click title bar). Subcomponents: `CallControlBar.tsx`, `CallParticipantTile.tsx`, `ConnectionQualityIcon.tsx`, `CallParticipantContextMenu.tsx`. Local camera PiP is draggable within the call window
- **Incoming call**: Discord-style toast popup (`IncomingCallModal.tsx`) — dark card in top-right corner with slide-in animation, pulsing green ring on avatar

## Key Patterns

- Vite dev server proxies `/api`, `/uploads`, `/socket.io` to `http://localhost:8080`
- Frontend auth flow: login → store token in Zustand (persisted to localStorage) → attach as `Authorization: Bearer` header
- Refresh flow: on 401/403, client sends refresh token → server returns only new accessToken (no rotation)
- Supabase routes (`*_supabase.ts`) are the primary routes; legacy Prisma routes exist but are not mounted
- Media caching uses IndexedDB via `src/lib/cache/`
- Saved accounts stored in localStorage (`rumker-saved-accounts`) for quick re-login
- Notifications use Web Audio API (600 Hz tone, 300 ms) — AudioContext requires `.resume()` call
- TODO/project status tracked in `TODO.md` (in Russian)
- UI localized in Russian
- Reactions: toggle via `POST /:chatId/messages/:messageId/reactions` with `{ emoji }` — server checks existing → delete or insert → emit `message:reaction` event. Frontend uses optimistic update + revert on error
- Telegram 2FA: `POST /api/auth/telegram/check-password` with `{ phoneNumber, password }`. Backend calls gram.js `computeCheck` for SRP password verification
- Code splitting: route-level via `React.lazy()` in `App.tsx`, component-level in `ChatWindow.tsx` (PollCreator, GifPicker, GroupInfoPanel wrapped in `<Suspense>`), vendor chunks via `manualChunks` in `vite.config.ts`
- Message list virtualization: `@tanstack/react-virtual` `useVirtualizer` in `ChatWindow.tsx` — flat `VirtualItemData[]` array (date-separator, unread-divider, message items), `measureElement` for dynamic heights, `overscan: 15`
- Read receipts: Telegram-style ✓✓. Backend GET messages returns `status: 'read'` by checking `message_reads` table. Real-time via `message:read` socket event → `readReceipts` store + `markAsRead` marks all messages up to read point. Context menu shows "Прочитали" with avatar row (groups) or "Прочитано HH:MM" (private). `readReceipts` in chatStore: `Record<string, ReadReceipt[]>`
- Privacy settings: `PrivacySettings` type has `lastSeen`, `profilePhoto`, `phoneNumber` (visibility) + `readReceipts` (boolean toggle). Stored in `users.privacy_settings` JSONB. Frontend syncs via `GET/PUT /api/users/me/privacy`. When `readReceipts: false`, client doesn't send read events
- Last seen: Socket updates `users.last_seen` + `users.is_online` on connect/disconnect. Broadcast includes `lastSeen` timestamp
- Context menu full-row: `onContextMenu` on outermost virtualizer item div (full viewport width), not just the bubble

## Backend Performance Patterns

- **Parallel DB queries**: Always use `Promise.all([])` for independent Supabase queries (e.g., fetchPollData runs polls/options/votes in parallel)
- **Voice channel cache**: `channelChatIdCache` in `socket/index.ts` — in-memory Map with 5min TTL for `channelId → chatId`. Use `getChannelChatId()` instead of direct DB queries
- **User info cache on socket**: `(socket as any).userInfo` is populated on connect — use it in voice/call handlers instead of re-fetching from DB
- **Reverse call index**: `userCallMap` (userId → callId) for O(1) `findCallByUser()` — always maintain it when adding/removing call participants
- **Fire-and-forget**: `chats.update({ updated_at })` after message send doesn't need `await` — use `.then(null, err => ...)` for error logging
- **SELECT specific columns**: Never use `SELECT *` in production queries — always list only needed columns
- **Static imports**: Use static `import { supabase }` instead of dynamic `await import()` for shared modules
- **Database indexes**: Migration `007_performance_indexes.sql` adds indexes for all hot query paths — run it on any new Supabase instance
- **Privacy migration**: Migration `008_privacy_settings.sql` adds `privacy_settings JSONB` column to `users` table. Auto-migration in `server/lib/migrate.ts`

## Security

- **JWT**: Separate secrets (`JWT_SECRET` for access, `JWT_REFRESH_SECRET` for refresh). Tokens contain `type: 'access'/'refresh'`. `authenticateToken` rejects refresh tokens used as Bearer
- **Refresh tokens hashed**: SHA-256 via `hashToken()` before DB storage. Compare with `hashToken(token)` on lookup
- **Upload security**: SVG blocked, disk storage (not memory), 50MB limit, uploads served with `nosniff` + separate CSP
- **Logout**: `POST /api/auth/logout` — deletes session from DB + clears httpOnly cookie
- **.env not in git**: Added to `.gitignore`, `.env.example` provided with placeholders

## Common Pitfalls

- **Socket rooms**: Never add `socketService.leaveChat()` calls for room switching — users must stay in all rooms to receive messages in real-time
- **Stale closures in hooks**: Use `useAuthStore.getState()` inside callbacks instead of capturing reactive values in closures
- **Refresh token**: Do NOT rotate refresh tokens on `/refresh` — this causes race conditions on concurrent requests or lost responses
- **AudioContext**: Must call `.resume()` before playing — browsers suspend it until user gesture
- **`/read` endpoint**: Always graceful (try/catch) — DB errors should not return 500
- **Voice channels + calls guard**: If a user is in an active call (`callStore.activeCall`), don't allow joining a voice channel, and vice versa
- **VoiceChannelPeerManager lifecycle**: `init()` in `joinChannel()`, `destroy()` in `leaveChannel()` — always cleanup WebRTC resources
- **Friends API response format**: `GET /api/friends` returns `{ friends: [{ id, friend: { user data }, since }] }` — not a flat array. Must map `item.friend` to get user data
- **Sheet + CSS hiding**: shadcn Sheet uses React Portal (renders to `document.body`). Wrapping in `md:hidden` div doesn't prevent rendering. Use runtime JS `isDesktop` detection instead
- **Profile panel animation**: Use CSS `transition` on width (not `animation: slide-from-right`) for smooth open/close. The `animation` approach only plays once and doesn't animate closing
- **Profile/GroupInfo panel mutual exclusion**: `handleGroupInfo` and `handleAvatarClick` in ChatWindow must close the opposite panel before opening. Opening profile → `setGroupInfoOpen(false)` first; opening group → `setProfileOpen(false)` first. Both panels close on chat switch via `useEffect` on `activeChat?.id`
- **UserProfilePanel layout**: Telegram-style — no gradient, X top-left, edit pencil top-right, info items (phone/username/bio) always visible as tappable list rows with tap-to-copy. No "Инфо" tab — only Медиа/Файлы/Ссылки tabs
- **GroupInfoPanel participant label**: Must guard with `{!isPrivateChat && ...}` — otherwise shows "Группа · 2 участника" for private chats when panel stays open across chat switches
- **Call button**: Only show in private chats, not group/channel headers
- **Message ordering**: Backend returns newest messages first (`ascending: false`) then reverses to chronological. `loadMoreMessages` uses `offset = currentMessages.length` to paginate older messages
- **Scroll to bottom**: Uses double `requestAnimationFrame` + waits for `isLoadingMessages` to become `false`. Do NOT use `setTimeout` — it races with async message loading
- **Socket lifecycle**: `useSocket` hook sets up listeners ONCE. On token refresh, only calls `socketService.updateAuth()` — NEVER disconnect/reconnect. Disconnect only on logout/unmount. This prevents 15-min real-time gaps
- **Socket reconnection**: `reconnectionAttempts: Infinity` — chat apps must never give up. Socket auto-refreshes JWT via `_tryRefreshAndReconnect()` on `connect_error` with auth errors
- **joinUserToRoom**: Function adds `chat:` prefix internally. Callers must pass RAW chatId (UUID), NOT `chat:${chatId}`. Double-prefix causes messages to go to wrong room
- **Socket reconnect**: `useSocket.ts` reconnect handler calls both `loadChats()` and `loadMessages()` to refresh data after disconnection
- **Store persistence**: `chatStore` persists `chats` + `lastReadMessageId` (NOT messages). `voiceChannelStore` persists only `voiceSettings`. Messages are always re-fetched from API
- **viewingChannel vs activeChat**: `viewingChannel` in `voiceChannelStore` takes render priority over `activeChat`. When a new chat is selected, `viewingChannel` is cleared automatically via effect in `Messenger.tsx`
- **Poll messages**: Backend must fetch pollData from polls/poll_options/poll_votes tables when returning poll-type messages. Poll real-time updates use `pollId` (not `messageId`) in the `poll:update` socket event
- **Files vs Media in profiles**: `UserProfilePanel` needs separate `fileMessages` state — don't mix with `mediaMessages`. The files tab must use `setFileMessages`, not `setMediaMessages`
- **Scroll savedPositions**: Never save `scrollTop = 0` — it means the DOM wasn't ready yet. Only save positive values to avoid overwriting real positions with zero
- **Voice channel create**: `VoiceChannelList` has hover "+" per category; `GroupInfoPanel` has a visible "+" in the voice section header that opens an inline create form
- **Voice channel navigation from GroupInfoPanel**: `VoiceChannelList` must call `setViewingChannel()` when joining a channel AND invoke `onChannelJoined` callback to close the panel. Without this, the user gets kicked back to the chat view
- **Voice channel categories**: Categories are derived from the `category` string field on `voice_channels` table (no separate table). Rename = batch update all channels matching old name. Delete = delete all channels in category. Reorder = update position offsets (base * 100 + index)
- **api.delete doesn't support body**: The API client's `delete<T>(endpoint)` method doesn't accept a request body. For endpoints needing a body on deletion, use POST instead (e.g., `POST /voice-channels/categories/delete`)
- **Message bubble overlap**: Timestamp uses `float-right` with negative margin. Ensure sufficient `min-w`, padding (`px-3`), spacer width (`w-[78px]`), and margin (`-mt-3 ml-3`) to prevent text/time overlap
- **Virtualizer hooks order**: `chatMessages`, `virtualItems`, `virtualizer`, and `unreadDividerVIndex` must be declared BEFORE `scrollToBottom` callback and BEFORE the `if (!activeChat) return` early return — React hooks cannot be called conditionally
- **Reactions optimistic update**: `toggleReaction` in chatStore applies the change immediately, calls API, then reverts on error. Socket handler skips own reactions (matched by `userId === myId`) to avoid double-update
- **Reactions batch loading**: `GET /:chatId/messages` fetches all reactions for the message batch in a single query, groups by emoji → `{ emoji, userIds[] }`, and injects into each formatted message
- **chatReady must be state**: `chatReadyRef` alone (ref) doesn't trigger re-render when set to `true` — messages stay `opacity-0` forever. Must use `setChatReady(true)` state alongside the ref so the DOM updates. The ref is kept for synchronous reads in useLayoutEffect
- **Delayed setActiveChat(null) race**: `Messenger.tsx` `handleBack` delays `setActiveChat(null)` by 300ms for slide animation. If user clicks a new chat within that window, the delayed null overwrites it. The fix: `useEffect` on `activeChat` clears `delayedClearRef` timeout when a new chat is selected
- **Call deafen**: `toggleDeafen()` in callStore automatically mutes the mic (`isMuted: true`). `PeerManager.setDeafened()` mutes all remote `audioElements`. Socket emits `call:toggle-deafen` → server broadcasts `call:deafen-changed`
- **ActiveCallOverlay dock positions**: 'float' (draggable+resizable), 'left'/'right'/'top'/'bottom' (50% snap), 'fullscreen'. Drag to viewport edge auto-docks. Dock hint overlay (blue) shows during drag. Double-click title bar toggles fullscreen
- **Opus SDP munging**: `mungeOpusSdp()` must be applied to BOTH local and remote SDP (before `setLocalDescription` and `setRemoteDescription`) in PeerManager and VoiceChannelPeerManager
- **Read receipts race condition**: `loadMessages` and `getReadReceipts` must both complete before hydrating statuses. Use `Promise.all([loadMsgs, loadReceipts])` — if receipts arrive before messages, the hydration finds empty messages array
- **Read receipts privacy**: When user disables `readReceipts` in settings, client must NOT call `markMessagesRead()` or `socketService.markRead()`. Check `useSettingsStore.getState().privacy.readReceipts` before sending
- **Backend read status**: GET messages computes `status: 'read'` by querying `message_reads` for the chat, finding the latest read timestamp among all other users, and comparing each own message's timestamp. No longer hardcoded to `'sent'`
- **Privacy settings JSONB**: `users.privacy_settings` column defaults to `{"lastSeen":"everyone","profilePhoto":"everyone","phoneNumber":"contacts","readReceipts":true}`. If column doesn't exist, run migration `008_privacy_settings.sql`
- **Context menu readBy**: `readReceipts` in chatStore is reactive (subscribed via `useChatStore((s) => s.readReceipts)`). Context menu computes `readBy` by filtering receipts where `lastReadMessageId` timestamp >= context message timestamp
