
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, ArrowRight, Loader2, Mail, X, UserPlus, ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { tokenStorage } from '@/lib/tokenStorage';
import { getSavedAccounts, saveAccount, removeAccount, type SavedAccount } from '@/lib/savedAccounts';

// --- Schemas ---
const phoneSchema = z.object({
    phone: z.string().min(10, 'Enter valid phone number'),
});

const codeSchema = z.object({
    code: z.string().min(5, 'Code must be at least 5 digits'),
    password: z.string().optional(),
});

const loginEmailSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 chars'),
});

const registerEmailSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 chars'),
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 chars'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

const passwordOnlySchema = z.object({
    password: z.string().min(1, 'Password is required'),
});

const twoFaSchema = z.object({
    password: z.string().min(1, 'Введите пароль'),
});

type AuthMode = 'login' | 'register';
type LoginView = 'picker' | 'password-only' | 'full-form';

export function LoginPage() {
    const [activeTab, setActiveTab] = useState('telegram');
    const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
    const [emailMode, setEmailMode] = useState<AuthMode>('login');
    const [loading, setLoading] = useState(false);
    const [phoneHash, setPhoneHash] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');

    // Account switcher state
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
    const [loginView, setLoginView] = useState<LoginView>('full-form');

    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);

    // Load saved accounts on mount
    useEffect(() => {
        const accounts = getSavedAccounts();
        setSavedAccounts(accounts);
        if (accounts.length > 0) {
            setLoginView('picker');
        }
    }, []);

    // --- Telegram Forms ---
    const { register: regPhone, handleSubmit: subPhone, formState: { errors: errPhone } } = useForm({
        resolver: zodResolver(phoneSchema),
    });

    const { register: regCode, handleSubmit: subCode, formState: { errors: errCode } } = useForm({
        resolver: zodResolver(codeSchema),
    });

    const { register: reg2fa, handleSubmit: sub2fa, formState: { errors: err2fa } } = useForm({
        resolver: zodResolver(twoFaSchema),
    });

    // --- Email Forms ---
    const { register: regLogin, handleSubmit: subLogin, formState: { errors: errLogin } } = useForm({
        resolver: zodResolver(loginEmailSchema),
    });

    const { register: regRegister, handleSubmit: subRegister, formState: { errors: errRegister } } = useForm({
        resolver: zodResolver(registerEmailSchema),
    });

    // --- Password-only form for selected account ---
    const { register: regPwdOnly, handleSubmit: subPwdOnly, formState: { errors: errPwdOnly }, reset: resetPwdOnly } = useForm({
        resolver: zodResolver(passwordOnlySchema),
    });

    // --- Handlers ---

    const handleSelectAccount = (account: SavedAccount) => {
        setSelectedAccount(account);
        setLoginView('password-only');
        resetPwdOnly();
    };

    const handleRemoveAccount = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        removeAccount(id);
        const updated = getSavedAccounts();
        setSavedAccounts(updated);
        if (updated.length === 0) {
            setLoginView('full-form');
        }
    };

    const handleAddAccount = () => {
        setLoginView('full-form');
        setSelectedAccount(null);
    };

    const handleBackToPicker = () => {
        setLoginView('picker');
        setSelectedAccount(null);
    };

    const onPasswordOnlyLogin = async (data: { password: string }) => {
        if (!selectedAccount) return;
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: selectedAccount.email, password: data.password }),
            });
            const json = await res.json();

            if (!res.ok) throw new Error(json.error || 'Auth failed');

            toast.success(`Welcome, ${json.user.username}!`);
            login(json.user, json.accessToken);
            tokenStorage.setToken(json.accessToken);
            saveAccount({
                id: json.user.id,
                username: json.user.username,
                email: json.user.email || selectedAccount.email,
                firstName: json.user.firstName,
                lastName: json.user.lastName,
                avatar: json.user.avatar || null,
            });
            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Login failed';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const onSendCode = async (data: { phone: string }) => {
        setLoading(true);
        try {
            const formattedPhone = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
            const res = await fetch('/api/auth/telegram/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: formattedPhone }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to send code');

            setPhoneHash(json.phoneCodeHash);
            setPhoneNumber(formattedPhone);
            setStep('code');
            toast.success('Code sent to Telegram app');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to send code';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const onSignInTelegram = async (data: { code: string; password?: string }) => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/telegram/sign-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    phoneCodeHash: phoneHash,
                    phoneCode: data.code,
                    password: data.password,
                }),
            });
            const json = await res.json();

            if (res.status === 401 && json.error === '2FA_REQUIRED') {
                setStep('2fa');
                toast.info('Требуется пароль двухфакторной аутентификации');
                return;
            }
            if (!res.ok) throw new Error(json.error || 'Login failed');

            toast.success(`Welcome back, ${json.user.firstName}!`);
            login(json.user, json.accessToken);
            tokenStorage.setToken(json.accessToken);
            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to send code';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const on2faCheck = async (data: { password: string }) => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/telegram/check-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber, password: data.password }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Неверный пароль');

            toast.success(`С возвращением, ${json.user.firstName || json.user.username}!`);
            login(json.user, json.accessToken);
            tokenStorage.setToken(json.accessToken);
            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Неверный пароль';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const onEmailAuth = async (data: { email: string; password: string; username?: string; confirmPassword?: string }) => {
        setLoading(true);
        const endpoint = emailMode === 'login' ? '/api/auth/login' : '/api/auth/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json();

            if (!res.ok) throw new Error(json.error || 'Auth failed');

            toast.success(`Welcome, ${json.user.username}!`);
            login(json.user, json.accessToken);
            tokenStorage.setToken(json.accessToken);

            // Save account for future quick login
            if (data.email) {
                saveAccount({
                    id: json.user.id,
                    username: json.user.username,
                    email: json.user.email || data.email,
                    firstName: json.user.firstName,
                    lastName: json.user.lastName,
                    avatar: json.user.avatar || null,
                });
            }

            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Ошибка авторизации';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    // --- Helper: initials for avatar ---
    const getInitials = (account: SavedAccount) => {
        if (account.firstName) {
            return (account.firstName[0] + (account.lastName?.[0] || '')).toUpperCase();
        }
        return account.username[0].toUpperCase();
    };

    const getDisplayName = (account: SavedAccount) => {
        if (account.firstName) {
            return `${account.firstName}${account.lastName ? ' ' + account.lastName : ''}`;
        }
        return account.username;
    };

    // --- Account Picker View ---
    if (loginView === 'picker') {
        return (
            <div className="flex h-dvh items-center justify-center bg-tg-bg px-3 sm:px-4 py-4 sm:py-6">
                <Card className="w-full max-w-[calc(100vw-24px)] sm:max-w-sm border-tg-divider bg-white shadow-lg dark:bg-tg-header overflow-hidden animate-fade-scale-in">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
                            <Mail className="h-8 w-8" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-tg-text">Rumker</CardTitle>
                        <CardDescription>
                            Выберите аккаунт для входа
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-2">
                        {savedAccounts.map((account) => (
                            <div
                                key={account.id}
                                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-tg-primary/5 transition-colors border border-transparent hover:border-tg-primary/20"
                                onClick={() => handleSelectAccount(account)}
                            >
                                {account.avatar ? (
                                    <img
                                        src={account.avatar}
                                        alt=""
                                        className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-tg-primary/10 text-tg-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">
                                        {getInitials(account)}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-tg-text truncate">
                                        {getDisplayName(account)}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {account.email}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                                    onClick={(e) => handleRemoveAccount(e, account.id)}
                                    title="Remove account"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}

                        <Button
                            variant="outline"
                            className="w-full mt-3"
                            onClick={handleAddAccount}
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Добавить аккаунт
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // --- Password-only View (for selected saved account) ---
    if (loginView === 'password-only' && selectedAccount) {
        return (
            <div className="flex h-dvh items-center justify-center bg-tg-bg px-3 sm:px-4 py-4 sm:py-6">
                <Card className="w-full max-w-[calc(100vw-24px)] sm:max-w-sm border-tg-divider bg-white shadow-lg dark:bg-tg-header overflow-hidden animate-fade-scale-in">
                    <CardHeader className="text-center pb-2">
                        {selectedAccount.avatar ? (
                            <img
                                src={selectedAccount.avatar}
                                alt=""
                                className="mx-auto mb-4 h-16 w-16 rounded-full object-cover"
                            />
                        ) : (
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary text-xl font-semibold">
                                {getInitials(selectedAccount)}
                            </div>
                        )}
                        <CardTitle className="text-xl font-bold text-tg-text">
                            {getDisplayName(selectedAccount)}
                        </CardTitle>
                        <CardDescription>
                            {selectedAccount.email}
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={subPwdOnly(onPasswordOnlyLogin)} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="pwd-only">Пароль</Label>
                                <Input
                                    id="pwd-only"
                                    type="password"
                                    autoFocus
                                    disabled={loading}
                                    {...regPwdOnly('password')}
                                />
                                {errPwdOnly.password?.message && (
                                    <p className="text-xs text-red-500">{String(errPwdOnly.password.message)}</p>
                                )}
                            </div>
                            <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Войти'}
                            </Button>
                            <Button
                                variant="link"
                                type="button"
                                onClick={handleBackToPicker}
                                className="w-full text-xs text-muted-foreground"
                            >
                                <ArrowLeft className="mr-1 h-3 w-3" />
                                Назад
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // --- Full Login Form (original) ---
    return (
        <div className="flex h-dvh items-center justify-center bg-tg-bg px-3 sm:px-4 py-4 sm:py-6">
            <Card className="w-full max-w-[calc(100vw-24px)] sm:max-w-sm border-tg-divider bg-white shadow-lg dark:bg-tg-header overflow-hidden animate-fade-scale-in">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
                        {activeTab === 'telegram' ? <Phone className="h-8 w-8" /> : <Mail className="h-8 w-8" />}
                    </div>
                    <CardTitle className="text-2xl font-bold text-tg-text">Rumker</CardTitle>
                    <CardDescription>
                        Общение без границ. Ваше пространство, ваши правила.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <Tabs defaultValue="telegram" onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="telegram">Telegram</TabsTrigger>
                            <TabsTrigger value="email">Email</TabsTrigger>
                        </TabsList>

                        {/* --- Telegram Tab --- */}
                        <TabsContent value="telegram">
                            {step === 'phone' && (
                                <form onSubmit={subPhone(onSendCode)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Номер телефона</Label>
                                        <Input
                                            id="phone"
                                            placeholder="+1234567890"
                                            disabled={loading}
                                            {...regPhone('phone')}
                                        />
                                        {errPhone.phone?.message && <p className="text-xs text-red-500">{String(errPhone.phone.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Далее'}
                                        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            )}
                            {step === 'code' && (
                                <form onSubmit={subCode(onSignInTelegram)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="code">Код</Label>
                                        <Input
                                            id="code"
                                            placeholder="12345"
                                            disabled={loading}
                                            {...regCode('code')}
                                        />
                                        {errCode.code?.message && <p className="text-xs text-red-500">{String(errCode.code.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Войти'}
                                    </Button>
                                    <Button
                                        variant="link"
                                        type="button"
                                        onClick={() => setStep('phone')}
                                        className="w-full text-xs text-muted-foreground"
                                    >
                                        Неправильный номер?
                                    </Button>
                                </form>
                            )}
                            {step === '2fa' && (
                                <form onSubmit={sub2fa(on2faCheck)} className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                        <Lock className="h-4 w-4" />
                                        <span>Двухфакторная аутентификация</span>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="twofa-pwd">Облачный пароль Telegram</Label>
                                        <Input
                                            id="twofa-pwd"
                                            type="password"
                                            placeholder="Пароль"
                                            autoFocus
                                            disabled={loading}
                                            {...reg2fa('password')}
                                        />
                                        {err2fa.password?.message && <p className="text-xs text-red-500">{String(err2fa.password.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Подтвердить'}
                                    </Button>
                                    <Button
                                        variant="link"
                                        type="button"
                                        onClick={() => setStep('phone')}
                                        className="w-full text-xs text-muted-foreground"
                                    >
                                        <ArrowLeft className="mr-1 h-3 w-3" />
                                        Начать заново
                                    </Button>
                                </form>
                            )}
                        </TabsContent>

                        {/* --- Email Tab --- */}
                        <TabsContent value="email">
                            {emailMode === 'login' ? (
                                <form onSubmit={subLogin(onEmailAuth)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Эл. почта</Label>
                                        <Input id="email" type="email" placeholder="user@example.com" {...regLogin('email')} />
                                        {errLogin.email?.message && <p className="text-xs text-red-500">{String(errLogin.email.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Пароль</Label>
                                        <Input id="password" type="password" {...regLogin('password')} />
                                        {errLogin.password?.message && <p className="text-xs text-red-500">{String(errLogin.password.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Войти'}
                                    </Button>
                                    <div className="text-center text-xs mt-2">
                                        Нет аккаунта?{' '}
                                        <span
                                            className="text-tg-primary cursor-pointer hover:underline"
                                            onClick={() => setEmailMode('register')}
                                        >
                                            Зарегистрироваться
                                        </span>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={subRegister(onEmailAuth)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-username">Имя пользователя</Label>
                                        <Input id="reg-username" placeholder="username" {...regRegister('username')} />
                                        {errRegister.username?.message && <p className="text-xs text-red-500">{String(errRegister.username.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-email">Эл. почта</Label>
                                        <Input id="reg-email" type="email" placeholder="user@example.com" {...regRegister('email')} />
                                        {errRegister.email?.message && <p className="text-xs text-red-500">{String(errRegister.email.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-password">Пароль</Label>
                                        <Input id="reg-password" type="password" {...regRegister('password')} />
                                        {errRegister.password?.message && <p className="text-xs text-red-500">{String(errRegister.password.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-conf-password">Повторите пароль</Label>
                                        <Input id="reg-conf-password" type="password" {...regRegister('confirmPassword')} />
                                        {errRegister.confirmPassword?.message && <p className="text-xs text-red-500">{String(errRegister.confirmPassword.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Зарегистрироваться'}
                                    </Button>
                                    <div className="text-center text-xs mt-2">
                                        Уже есть аккаунт?{' '}
                                        <span
                                            className="text-tg-primary cursor-pointer hover:underline"
                                            onClick={() => setEmailMode('login')}
                                        >
                                            Войти
                                        </span>
                                    </div>
                                </form>
                            )}
                        </TabsContent>
                    </Tabs>

                    {savedAccounts.length > 0 && (
                        <div className="mt-4 text-center">
                            <Button
                                variant="link"
                                type="button"
                                onClick={handleBackToPicker}
                                className="text-xs text-muted-foreground"
                            >
                                <ArrowLeft className="mr-1 h-3 w-3" />
                                Сохранённые аккаунты
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
