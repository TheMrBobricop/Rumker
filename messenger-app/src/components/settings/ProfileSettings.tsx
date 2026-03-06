import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, User, Mail, Phone, Save } from 'lucide-react';
import { toast } from 'sonner';

export function ProfileSettings() {
    const profile = useSettingsStore((s) => s.profile);
    const updateProfile = useSettingsStore((s) => s.updateProfile);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        username: profile.username || '',
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        bio: profile.bio || '',
        email: profile.email || '',
        phone: profile.phone || '',
    });

    const [isLoading, setIsLoading] = useState(false);

    // Load profile from API on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api.get<{ user: any }>('/users/me/profile');
                if (cancelled) return;
                const u = data.user;
                const profileData = {
                    id: u.id,
                    username: u.username || '',
                    firstName: u.firstName || '',
                    lastName: u.lastName || '',
                    bio: u.bio || '',
                    email: u.email || '',
                    phone: u.phone || '',
                    avatar: u.avatar || '',
                };
                setFormData({
                    username: profileData.username,
                    firstName: profileData.firstName,
                    lastName: profileData.lastName,
                    bio: profileData.bio,
                    email: profileData.email,
                    phone: profileData.phone,
                });
                updateProfile(profileData);
            } catch {
                // Fallback to local store data
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const data = await api.patch<{ user: any }>('/users/me/profile', {
                firstName: formData.firstName,
                lastName: formData.lastName,
                bio: formData.bio,
                avatar: profile.avatar,
            });
            const u = data.user;
            const updatedProfile = {
                id: u.id,
                username: u.username || '',
                firstName: u.firstName || '',
                lastName: u.lastName || '',
                bio: u.bio || '',
                email: u.email || '',
                phone: u.phone || '',
                avatar: u.avatar || '',
            };
            updateProfile(updatedProfile);
            // Sync to auth store
            const authState = useAuthStore.getState();
            if (authState.user && authState.token) {
                authState.login(
                    { ...authState.user, firstName: u.firstName, lastName: u.lastName, bio: u.bio, avatar: u.avatar },
                    authState.token
                );
            }
            toast.success('Profile updated successfully');
        } catch {
            toast.error('Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Выберите изображение');
            return;
        }
        try {
            // Upload avatar to server
            const result = await api.uploadFile('/upload', file) as { url: string };
            const avatarUrl = result.url;
            updateProfile({ avatar: avatarUrl });
            // Sync to auth store
            const authState = useAuthStore.getState();
            if (authState.user && authState.token) {
                authState.login({ ...authState.user, avatar: avatarUrl }, authState.token);
            }
            toast.success('Аватар обновлён');
        } catch {
            // Fallback to local data URL
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                updateProfile({ avatar: dataUrl });
                const authState = useAuthStore.getState();
                if (authState.user && authState.token) {
                    authState.login({ ...authState.user, avatar: dataUrl }, authState.token);
                }
                toast.success('Аватар обновлён (локально)');
            };
            reader.readAsDataURL(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getInitials = () => {
        const name = formData.firstName || formData.username || 'U';
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Settings
                </CardTitle>
                <CardDescription>
                    Manage your personal information and how others see you
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <Avatar 
                            className="h-24 w-24 cursor-pointer hover:opacity-90 transition-opacity border-4 border-tg-primary/20"
                            onClick={handleAvatarClick}
                        >
                            <AvatarImage src={profile.avatar} />
                            <AvatarFallback className="bg-tg-primary text-white text-2xl font-medium">
                                {getInitials()}
                            </AvatarFallback>
                        </Avatar>
                        <button 
                            className="absolute bottom-0 right-0 p-2 bg-tg-primary text-white rounded-full shadow-lg hover:bg-tg-primary/90"
                            onClick={handleAvatarClick}
                        >
                            <Camera className="h-4 w-4" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Click to change profile picture
                    </p>
                </div>

                {/* Form Fields */}
                <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={formData.firstName}
                                onChange={(e) => handleChange('firstName', e.target.value)}
                                placeholder="Your first name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={formData.lastName}
                                onChange={(e) => handleChange('lastName', e.target.value)}
                                placeholder="Your last name"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="username" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Username
                        </Label>
                        <Input
                            id="username"
                            value={formData.username}
                            onChange={(e) => handleChange('username', e.target.value)}
                            placeholder="username"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            placeholder="your@email.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone" className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone
                        </Label>
                        <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) => handleChange('phone', e.target.value)}
                            placeholder="+1234567890"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Input
                            id="bio"
                            value={formData.bio}
                            onChange={(e) => handleChange('bio', e.target.value)}
                            placeholder="Tell us a little about yourself..."
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {formData.bio.length}/140
                        </p>
                    </div>
                </div>

                {/* Save Button */}
                <Button 
                    onClick={handleSave} 
                    disabled={isLoading}
                    className="w-full"
                >
                    {isLoading ? (
                        'Saving...'
                    ) : (
                        <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
