// ========================================
// API Client
// ========================================

import { useAuthStore } from '@/stores/authStore';
import { tokenStorage } from '@/lib/tokenStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

class ApiClient {
    private baseUrl: string;
    private refreshPromise: Promise<boolean> | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private getToken(): string | null {
        const authStore = useAuthStore.getState();
        return authStore.token || tokenStorage.getToken();
    }

    private getHeaders(customHeaders?: Record<string, string>): Headers {
        const headers = new Headers({
            'Content-Type': 'application/json',
            ...customHeaders,
        });

        const token = this.getToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        return headers;
    }

    private async tryRefreshToken(): Promise<boolean> {
        // Deduplicate concurrent refresh calls
        if (this.refreshPromise) return this.refreshPromise;

        this.refreshPromise = (async () => {
            try {
                const authStore = useAuthStore.getState();

                // Refresh token передаётся только через httpOnly cookie (credentials: 'include')
                // Не отправляем его в body — это уязвимость (XSS доступ к localStorage)
                const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                });

                if (!response.ok) {
                    // Session is dead — logout once
                    authStore.logout();
                    tokenStorage.setToken(null);
                    return false;
                }

                const data = await response.json();
                authStore.setTokens(data.accessToken);
                tokenStorage.setToken(data.accessToken);
                return true;
            } catch (err) {
                // Network error — do NOT logout, user might just be offline temporarily
                console.warn('[ApiClient] Refresh failed (network?):', err);
                return false;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const { method = 'GET', body, headers: customHeaders, signal } = options;

        const url = `${this.baseUrl}${endpoint}`;
        const headers = this.getHeaders(customHeaders);

        console.log('[ApiClient] Request:', method, url);

        const config: RequestInit = {
            method,
            headers,
            signal,
        };

        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }

        let response = await fetch(url, config);

        // Auto-refresh on 401/403
        if ((response.status === 401 || response.status === 403) && !endpoint.includes('/auth/')) {
            const refreshed = await this.tryRefreshToken();
            if (refreshed) {
                // Retry with new token
                const newHeaders = this.getHeaders(customHeaders);
                const retryConfig: RequestInit = { method, headers: newHeaders, signal };
                if (body && method !== 'GET') {
                    retryConfig.body = JSON.stringify(body);
                }
                response = await fetch(url, retryConfig);
            }
            // Don't logout here — let the caller or App-level logic handle session expiry
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new ApiError(
                response.status,
                errorData?.message || errorData?.error || response.statusText,
                errorData
            );
        }

        return response.json();
    }

    async get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET', signal });
    }

    async post<T>(endpoint: string, body: unknown): Promise<T> {
        return this.request<T>(endpoint, { method: 'POST', body });
    }

    async put<T>(endpoint: string, body: unknown): Promise<T> {
        return this.request<T>(endpoint, { method: 'PUT', body });
    }

    async patch<T>(endpoint: string, body: unknown): Promise<T> {
        return this.request<T>(endpoint, { method: 'PATCH', body });
    }

    async delete<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    async uploadFile(
        endpoint: string,
        file: File,
        additionalData?: Record<string, string>
    ): Promise<unknown> {
        const formData = new FormData();
        formData.append('file', file);

        if (additionalData) {
            Object.entries(additionalData).forEach(([key, value]) => {
                formData.append(key, value);
            });
        }

        const headers = new Headers();
        const token = this.getToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        let response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        // Auto-refresh on 401/403
        if (response.status === 401 || response.status === 403) {
            const refreshed = await this.tryRefreshToken();
            if (refreshed) {
                const retryHeaders = new Headers();
                const newToken = this.getToken();
                if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
                response = await fetch(`${this.baseUrl}${endpoint}`, {
                    method: 'POST',
                    headers: retryHeaders,
                    body: formData,
                });
            }
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new ApiError(
                response.status,
                errorData?.message || errorData?.error || response.statusText,
                errorData
            );
        }

        return response.json();
    }
}

export class ApiError extends Error {
    status: number;
    data: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

// Singleton instance
export const api = new ApiClient(API_BASE_URL);
