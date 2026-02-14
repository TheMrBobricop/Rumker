
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram/tl';
import path from 'path';
import fs from 'fs';

// Интерфейс для хранения сессии в памяти сервера
interface ActiveClient {
    client: TelegramClient;
    userId: string;
    phone: string;
}

class TelegramService {
    private activeClients: Map<string, ActiveClient> = new Map();

    // API ID и Hash — лучше вынести в env, но пока заглушкой
    // В реальном проекте каждый пользователь должен вводить свои или использовать общий app
    private apiId: number = parseInt(process.env.TELEGRAM_API_ID || '0');
    private apiHash: string = process.env.TELEGRAM_API_HASH || '';

    constructor() {
        if (!this.apiId || !this.apiHash) {
            console.warn('⚠️ TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in .env');
        }
    }

    /**
     * Инициализация клиента для пользователя
     * @param userId ID пользователя в нашей системе
     * @param sessionString Строка сессии (StringSession) из БД
     */
    async initializeClient(userId: string, sessionString: string = '') {
        if (this.activeClients.has(userId)) {
            return this.activeClients.get(userId)!.client;
        }

        const session = new StringSession(sessionString);
        const client = new TelegramClient(session, this.apiId, this.apiHash, {
            connectionRetries: 5,
            useWSS: false, // Node.js environment
            deviceModel: 'Rumker Web',
            systemVersion: '1.0.0',
            appVersion: '1.0.0',
            langCode: 'en',
            systemLangCode: 'en',
        });

        // Подключение (без интерактивного ввода, предполагается, что сессия валидна)
        // Для первого входа (Login) будет отдельный метод
        try {
            await client.connect();

            // Добавляем обработчик событий
            client.addEventHandler((event) => {
                this.handleEvent(userId, event);
            }, new NewMessage({}));

            this.activeClients.set(userId, {
                client,
                userId,
                phone: '', // Нужно получить из getMe() если требуется
            });

            console.log(`✅ Telegram Client initialized for user ${userId}`);
            return client;
        } catch (error) {
            console.error(`❌ Failed to initialize Telegram client for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Вход по номеру телефона (Шаг 1)
     */
    async sendCode(userId: string, phoneNumber: string) {
        const client = new TelegramClient(new StringSession(''), this.apiId, this.apiHash, {
            connectionRetries: 5,
            deviceModel: 'Rumker Web',
        });

        await client.connect();

        // Сохраняем временного клиента для завершения авторизации
        this.activeClients.set(`temp_${userId}`, { client, userId, phone: phoneNumber });

        // Используем invoke для отправки кода
        const result = await client.invoke(
            new Api.auth.SendCode({
                phoneNumber,
                apiId: this.apiId,
                apiHash: this.apiHash,
                settings: new Api.CodeSettings({}),
            })
        );

        return { phoneCodeHash: (result as any).phoneCodeHash };
    }

    /**
     * Завершение входа (Шаг 2)
     */
    async signIn(userId: string, phoneNumber: string, phoneCodeHash: string, phoneCode: string) {
        const tempClient = this.activeClients.get(`temp_${userId}`);
        if (!tempClient) throw new Error('Client not initialized. Call sendCode first.');

        const client = tempClient.client;

        try {
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash,
                    phoneCode,
                })
            );

            // Сохраняем сессию
            const sessionString = client.session.save() as unknown as string;

            // Перемещаем из temp в active
            this.activeClients.delete(`temp_${userId}`);
            this.activeClients.set(userId, { client, userId, phone: phoneNumber });

            // Настраиваем слушатели
            client.addEventHandler((event) => {
                this.handleEvent(userId, event);
            }, new NewMessage({}));

            return { sessionString };
        } catch (error) {
            console.error('Sign In Error:', error);
            throw error;
        }
    }

    /**
     * Отправка сообщения
     */
    async sendMessage(userId: string, peer: string, message: string) {
        const clientData = this.activeClients.get(userId);
        if (!clientData) throw new Error('Client not active');

        return await clientData.client.sendMessage(peer, { message });
    }

    /**
     * Получение диалогов
     */
    async getDialogs(userId: string, limit: number = 20) {
        const clientData = this.activeClients.get(userId);
        if (!clientData) throw new Error('Client not active');

        return await clientData.client.getDialogs({ limit });
    }

    private handleEvent(userId: string, event: any) {
        const message = event.message;
        // Здесь будем отправлять событие через Socket.IO на фронтенд
        console.log(`📩 New message for user ${userId}:`, message.message);
    }

    /**
     * Disconnect user
     */
    async disconnect(userId: string) {
        const clientData = this.activeClients.get(userId);
        if (clientData) {
            await clientData.client.disconnect();
            this.activeClients.delete(userId);
        }
    }
}

export const telegramService = new TelegramService();
