import { create } from 'zustand';

interface MediaStore {
    // State
    cacheSize: number;
    isLoading: boolean;

    // Actions
    setCacheSize: (size: number) => void;
    setLoading: (loading: boolean) => void;
}

export const useMediaStore = create<MediaStore>((set) => ({
    cacheSize: 0,
    isLoading: false,

    setCacheSize: (cacheSize) => set({ cacheSize }),
    setLoading: (isLoading) => set({ isLoading }),
}));
