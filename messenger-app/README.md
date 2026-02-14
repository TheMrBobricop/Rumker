# Rumker Messenger

A modern private messaging application built with React, TypeScript, and Express.js, featuring real-time chat, friend system, and Telegram integration.

## 🚀 Features

- **Real-time Messaging** - Instant chat with WebSocket support
- **Friend System** - Send, accept, and manage friend requests
- **User Search** - Find users by unique ID (username)
- **Telegram Integration** - Sync with Telegram conversations
- **Modern UI** - Clean, responsive interface with dark/light themes
- **Authentication** - Secure JWT-based authentication
- **Mobile Responsive** - Works seamlessly on all devices

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - Lightweight state management
- **Lucide React** - Beautiful icon library
- **Sonner** - Toast notifications

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **TypeScript** - Type-safe backend
- **Prisma** - Modern ORM with SQLite
- **JWT** - JSON Web Token authentication
- **Socket.io** - Real-time WebSocket communication

### Database
- **SQLite** - Lightweight file-based database
- **Prisma ORM** - Type-safe database operations

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Git**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/rumker-messenger.git
cd rumker-messenger
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
