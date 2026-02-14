// ========================================
// API Client
// ========================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

class ApiClient {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string | null): void {
        this.token = token;
    }

    getToken(): string | null {
        return this.token;
    }

    private getHeaders(customHeaders?: Record<string, string>): Headers {
        const headers = new Headers({
            'Content-Type': 'application/json',
            ...customHeaders,
        });

        if (this.token) {
            headers.set('Authorization', `Bearer ${this.token}`);
        }

        return headers;
    }

    async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const { method = 'GET', body, headers: customHeaders, signal } = options;

        const url = `${this.baseUrl}${endpoint}`;
        const headers = this.getHeaders(customHeaders);

        const config: RequestInit = {
            method,
            headers,
            signal,
        };

        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }

        const response = await fetch(url, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new ApiError(
                response.status,
                errorData?.message || response.statusText,
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
        if (this.token) {
            headers.set('Authorization', `Bearer ${this.token}`);
        }
        // Do NOT set Content-Type — the browser will set it with the boundary

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new ApiError(
                response.status,
                errorData?.message || response.statusText,
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
