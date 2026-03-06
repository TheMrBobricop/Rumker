const STORAGE_KEY = 'rumker-saved-accounts';
const MAX_ACCOUNTS = 5;

export interface SavedAccount {
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    avatar?: string | null;
}

export function getSavedAccounts(): SavedAccount[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveAccount(account: SavedAccount): void {
    const accounts = getSavedAccounts().filter((a) => a.id !== account.id);
    accounts.unshift(account);
    if (accounts.length > MAX_ACCOUNTS) accounts.length = MAX_ACCOUNTS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function removeAccount(id: string): void {
    const accounts = getSavedAccounts().filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}
