
import { useState } from 'react';
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
import { Phone, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { tokenStorage } from '@/lib/tokenStorage';

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

type AuthMode = 'login' | 'register';

export function LoginPage() {
    const [activeTab, setActiveTab] = useState('telegram');
    const [step, setStep] = useState<'phone' | 'code'>('phone');
    const [emailMode, setEmailMode] = useState<AuthMode>('login');
    const [loading, setLoading] = useState(false);
    const [phoneHash, setPhoneHash] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');

    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);

    // --- Telegram Forms ---
    const { register: regPhone, handleSubmit: subPhone, formState: { errors: errPhone } } = useForm({
        resolver: zodResolver(phoneSchema),
    });

    const { register: regCode, handleSubmit: subCode, formState: { errors: errCode } } = useForm({
        resolver: zodResolver(codeSchema),
    });

    // --- Email Forms ---
    const { register: regLogin, handleSubmit: subLogin, formState: { errors: errLogin } } = useForm({
        resolver: zodResolver(loginEmailSchema),
    });

    const { register: regRegister, handleSubmit: subRegister, formState: { errors: errRegister } } = useForm({
        resolver: zodResolver(registerEmailSchema),
    });

    // --- Handlers ---

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
                toast.warning('2FA required (not implemented in UI)');
                return;
            }
            if (!res.ok) throw new Error(json.error || 'Login failed');

            toast.success(`Welcome back, ${json.user.firstName}!`);
            login(json.user, json.accessToken, json.refreshToken);
            tokenStorage.setToken(json.accessToken);
            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to send code';
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
            login(json.user, json.accessToken, json.refreshToken);
            tokenStorage.setToken(json.accessToken);
            navigate('/');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to send code';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-dvh items-center justify-center bg-tg-bg px-4 py-6">
            <Card className="w-full max-w-sm border-tg-divider bg-white shadow-lg dark:bg-tg-header overflow-hidden animate-fade-scale-in">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
                        {activeTab === 'telegram' ? <Phone className="h-8 w-8" /> : <Mail className="h-8 w-8" />}
                    </div>
                    <CardTitle className="text-2xl font-bold text-tg-text">Rumker</CardTitle>
                    <CardDescription>
                        Connected messaging. Your space, your way.
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
                            {step === 'phone' ? (
                                <form onSubmit={subPhone(onSendCode)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone Number</Label>
                                        <Input
                                            id="phone"
                                            placeholder="+1234567890"
                                            disabled={loading}
                                            {...regPhone('phone')}
                                        />
                                        {errPhone.phone?.message && <p className="text-xs text-red-500">{String(errPhone.phone.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Next'}
                                        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            ) : (
                                <form onSubmit={subCode(onSignInTelegram)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="code">Code</Label>
                                        <Input
                                            id="code"
                                            placeholder="12345"
                                            disabled={loading}
                                            {...regCode('code')}
                                        />
                                        {errCode.code?.message && <p className="text-xs text-red-500">{String(errCode.code.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
                                    </Button>
                                    <Button
                                        variant="link"
                                        type="button"
                                        onClick={() => setStep('phone')}
                                        className="w-full text-xs text-muted-foreground"
                                    >
                                        Wrong number?
                                    </Button>
                                </form>
                            )}
                        </TabsContent>

                        {/* --- Email Tab --- */}
                        <TabsContent value="email">
                            {emailMode === 'login' ? (
                                <form onSubmit={subLogin(onEmailAuth)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" type="email" placeholder="user@example.com" {...regLogin('email')} />
                                        {errLogin.email?.message && <p className="text-xs text-red-500">{String(errLogin.email.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input id="password" type="password" {...regLogin('password')} />
                                        {errLogin.password?.message && <p className="text-xs text-red-500">{String(errLogin.password.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Login'}
                                    </Button>
                                    <div className="text-center text-xs mt-2">
                                        Don't have an account?{' '}
                                        <span
                                            className="text-tg-primary cursor-pointer hover:underline"
                                            onClick={() => setEmailMode('register')}
                                        >
                                            Register
                                        </span>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={subRegister(onEmailAuth)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-username">Username</Label>
                                        <Input id="reg-username" placeholder="username" {...regRegister('username')} />
                                        {errRegister.username?.message && <p className="text-xs text-red-500">{String(errRegister.username.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-email">Email</Label>
                                        <Input id="reg-email" type="email" placeholder="user@example.com" {...regRegister('email')} />
                                        {errRegister.email?.message && <p className="text-xs text-red-500">{String(errRegister.email.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-password">Password</Label>
                                        <Input id="reg-password" type="password" {...regRegister('password')} />
                                        {errRegister.password?.message && <p className="text-xs text-red-500">{String(errRegister.password.message)}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reg-conf-password">Confirm Password</Label>
                                        <Input id="reg-conf-password" type="password" {...regRegister('confirmPassword')} />
                                        {errRegister.confirmPassword?.message && <p className="text-xs text-red-500">{String(errRegister.confirmPassword.message)}</p>}
                                    </div>
                                    <Button type="submit" className="w-full bg-tg-primary hover:bg-tg-secondary" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Register'}
                                    </Button>
                                    <div className="text-center text-xs mt-2">
                                        Already have an account?{' '}
                                        <span
                                            className="text-tg-primary cursor-pointer hover:underline"
                                            onClick={() => setEmailMode('login')}
                                        >
                                            Login
                                        </span>
                                    </div>
                                </form>
                            )}
                        </TabsContent>
                    </Tabs>

                    <div className="mt-6 text-center text-xs text-muted-foreground">
                        <a href="/TELEGRAM_API_GUIDE.md" target="_blank" className="hover:underline">
                            Need help finding Telegram API ID?
                        </a>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
