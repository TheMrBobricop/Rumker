// Простое хранилище токена как fallback
class TokenStorage {
  private static instance: TokenStorage;
  private token: string | null = null;

  static getInstance(): TokenStorage {
    if (!TokenStorage.instance) {
      TokenStorage.instance = new TokenStorage();
    }
    return TokenStorage.instance;
  }

  setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem('auth-token', token);
    } else {
      localStorage.removeItem('auth-token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth-token');
    }
    return this.token;
  }

  clear(): void {
    this.token = null;
    localStorage.removeItem('auth-token');
  }
}

export const tokenStorage = TokenStorage.getInstance();
