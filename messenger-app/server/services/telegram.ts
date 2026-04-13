
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram/tl';
import path from 'path';
import fs from 'fs';

// пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ
interface ActiveClient {
    client: TelegramClient;
    userId: string;
    phone: string;
}

class TelegramService {
    private activeClients: Map<string, ActiveClient> = new Map();

    // API ID пїЅ Hash пїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ env, пїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
    // пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ app
    private apiId: number = parseInt(process.env.TELEGRAM_API_ID || '0');
    private apiHash: string = process.env.TELEGRAM_API_HASH || '';

    constructor() {
        if (!this.apiId || !this.apiHash) {
            console.warn('вљ пёЏ TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in .env');
        }
    }

    /**
     * пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
     * @param userId ID пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ
     * @param sessionString пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ (StringSession) пїЅпїЅ пїЅпїЅ
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

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ, пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ, пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ)
        // пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ (Login) пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ
        try {
            await client.connect();

            // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ
            client.addEventHandler((event) => {
                this.handleEvent(userId, event);
            }, new NewMessage({}));

            this.activeClients.set(userId, {
                client,
                userId,
                phone: '', // пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ getMe() пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
            });

            console.log(`вњ… Telegram Client initialized for user ${userId}`);
            return client;
        } catch (error) {
            console.error(`вќЊ Failed to initialize Telegram client for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * пїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅ 1)
     */
    async sendCode(userId: string, phoneNumber: string) {
        const client = new TelegramClient(new StringSession(''), this.apiId, this.apiHash, {
            connectionRetries: 5,
            deviceModel: 'Rumker Web',
        });

        await client.connect();

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
        this.activeClients.set(`temp_${userId}`, { client, userId, phone: phoneNumber });

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ invoke пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ
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
     * пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ 2FA пїЅпїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅ 3 пїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ)
     */
    async checkPassword(userId: string, password: string): Promise<{ sessionString: string }> {
        const tempClient = this.activeClients.get(`temp_${userId}`);
        if (!tempClient) throw new Error('пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ. пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ.');

        const client = tempClient.client;

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ SRP-пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ Telegram
        const passwordInfo = await client.invoke(new Api.account.GetPassword());

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ SRP-пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ gram.js
        const { computeCheck } = await import('telegram/Password');
        const inputCheckPassword = await computeCheck(passwordInfo, password);

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ
        await client.invoke(new Api.auth.CheckPassword({ password: inputCheckPassword }));

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ
        const sessionString = client.session.save() as unknown as string;

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ temp пїЅ active
        this.activeClients.delete(`temp_${userId}`);
        this.activeClients.set(userId, { client, userId, phone: tempClient.phone });

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
        client.addEventHandler((event) => {
            this.handleEvent(userId, event);
        }, new NewMessage({}));

        return { sessionString };
    }

    /**
     * пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅ 2)
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

            // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ
            const sessionString = client.session.save() as unknown as string;

            // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ temp пїЅ active
            this.activeClients.delete(`temp_${userId}`);
            this.activeClients.set(userId, { client, userId, phone: phoneNumber });

            // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
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
     * пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
     */
    async sendMessage(userId: string, peer: string, message: string) {
        const clientData = this.activeClients.get(userId);
        if (!clientData) throw new Error('Client not active');

        return await clientData.client.sendMessage(peer, { message });
    }

    /**
     * пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
     */
    async getDialogs(userId: string, limit: number = 20) {
        const clientData = this.activeClients.get(userId);
        if (!clientData) throw new Error('Client not active');

        return await clientData.client.getDialogs({ limit });
    }

    private handleEvent(userId: string, event: any) {
        const message = event.message;
        // пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ Socket.IO пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
        console.log(`рџ“© New message for user ${userId}:`, message.message);
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


