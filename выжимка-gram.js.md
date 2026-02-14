Вот твоя выжимка, оформленная в чистом Markdown-формате (всё содержимое сохранено без изменений и сокращений):

```markdown
# Выжимка по gram.js (https://gram.js.org) — 2026

**Современная** JavaScript/TypeScript MTProto-библиотека для Telegram (user + bot аккаунты).  
Основана на идеях Telethon (Python), но для JS/TS.  
Дает **полный доступ** ко всем методам Telegram API через TL-схемы.  
Поддерживает **Node.js** и **браузер** (с некоторыми ограничениями).

## Установка

```bash
npm install telegram
# для интерактивного ввода (очень удобно на старте)
npm install input
```

## Самое важное — авторизация (user-аккаунт)

1. Получи `api_id` и `api_hash` → https://my.telegram.org/apps
2. Базовый шаблон (самый частый сценарий):

```ts
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";          // или свой способ ввода

const apiId    = 123456;            // ← твой
const apiHash  = "xxxxxxxxxxxxxxxx"; // ← твой
const session  = new StringSession(""); // пустая → первый вход

(async () => {
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    // floodSleepThreshold: 1000,   // полезно при большом количестве запросов
  });

  await client.start({
    phoneNumber: async () => input.text("Номер телефона → "),
    password:    async () => input.text("Пароль 2FA (если есть) → "),
    phoneCode:   async () => input.text("Код из Telegram → "),
    onError: (err) => console.error("Ошибка авторизации:", err),
  });

  console.log("Успешный вход!");
  const sessionString = client.session.save(); // ! сохрани это
  console.log("Сохрани сессию:", sessionString);

  // Пример: сразу отправить себе сообщение
  await client.sendMessage("me", { message: "Тест из gram.js" });
})();
```

**После первого входа** вставляй сохранённую строку вместо пустой:

```ts
const session = new StringSession("1bvTsO...очень длинная строка...");
```

Тогда `client.start()` не будет запрашивать номер/код — вход мгновенный.

## Основные методы, которые используют 95% времени

| Действие                        | Код-пример (await client....)                                 | Комментарий                              |
|:--------------------------------|----------------------------------------------------------------|------------------------------------------|
| Отправить сообщение             | `sendMessage(peer, { message: "текст" })`                     | peer = "me", username, chat_id и т.д.   |
| Отправить файл / фото           | `sendFile(peer, { file: "./photo.jpg", caption: "подпись" })` | поддерживает Buffer, url, путь           |
| Скачать медиа                   | `downloadMedia(message.media)`                                 | возвращает Buffer                        |
| Получить диалоги                | `getDialogs({ limit: 100 })`                                   | список чатов                             |
| Получить историю сообщений      | `getMessages(chat, { limit: 100 })`                            | или `iterMessages` для потоковой загрузки|
| Выполнить любой TL-метод        | `invoke(new Api.messages.ReadHistory({ peer, maxId }))`       | полный контроль                          |

## События (реал-тайм обновления) — очень важно!

```ts
client.addEventHandler((update) => {
  if (update.className === "UpdateNewMessage") {
    const msg = update.message;
    console.log("Новое сообщение!", msg.message, "от", msg.senderId);
    // здесь можно сразу отвечать, помечать прочитанным и т.д.
  }
}, new updates.Raw()); // или другие фильтры: NewMessage, Message, etc.
```

Популярные обработчики:

- `updates.NewMessage`
- `updates.Message`
- `updates.ChatAction`
- `updates.UserStatus`

## Полезные настройки клиента (второй аргумент TelegramClient)

```ts
{
  connectionRetries    : 5,           // сколько раз пытаться переподключиться
  requestRetries       : 3,
  floodSleepThreshold  : 4000,        // пауза при FLOOD_WAIT (в мс)
  autoReconnect        : true,
  systemLanguage       : "ru",
  deviceModel          : "Rumker Web",
  systemVersion        : "Web",
  appVersion           : "1.0.0",
}
```

## Типичные паттерны использования в мессенджере

1. **Один пользователь → одна сессия**  
   Храни `StringSession` в базе зашифрованной (по user_id).

2. **Пул клиентов**  
   Для 10–100 онлайн-пользователей держи Map<userId, TelegramClient>.

3. **Переподключение**  
   Используй `client.connect()` + `client.addEventHandler` на `connection.*`.

4. **Отправка от имени пользователя**  
   Всё идёт от реального аккаунта — без [Bot] метки.

## Частые подводные камни

- **FLOOD_WAIT** — почти всегда из-за слишком частых запросов → добавляй задержки.
- **AUTH_KEY** перманентно теряется при `client.destroy()` без сохранения сессии.
- **Браузер** → нужна сборка без node-specific модулей + прокси-обход.
- **Баны** → Telegram банит за спам / массовые действия → имитируй человеческое поведение.

## Куда смотреть дальше (2026)

- https://gram.js.org/beta/ — полный список всех классов и методов (самое ценное)
- https://gram.js.org/#telegramclient — документация по TelegramClient
- GitHub → https://github.com/gram-js/gramjs (примеры, issues)

Если хочешь — могу дать готовые сниппеты под конкретную задачу:  
- авторизация через веб-форму  
- реал-тайм чат через socket.io  
- обработка медиа + скачивание  
- работа с несколькими аккаунтами одновременно  


