import { create } from 'zustand';

export interface ListingState {
    title: string;
    price: string;
    sku: string;
    description: string;
    platforms: string[];
    images: File[]; // Store actual File objects for upload
    imageUrls: string[]; // Store preview URLs or uploaded URLs

    setTitle: (title: string) => void;
    setPrice: (price: string) => void;
    setSku: (sku: string) => void;
    setDescription: (description: string) => void;
    togglePlatform: (platform: string) => void;
    addImage: (file: File) => void;
    removeImage: (index: number) => void;
    reset: () => void;
}

export const useListingStore = create<ListingState>((set) => ({
    title: '',
    price: '',
    sku: '',
    description: '',
    platforms: [],
    images: [],
    imageUrls: [],

    setTitle: (title) => set({ title }),
    setPrice: (price) => set({ price }),
    setSku: (sku) => set({ sku }),
    setDescription: (description) => set({ description }),

    togglePlatform: (platform) => set((state) => {
        const exists = state.platforms.includes(platform);
        return {
            platforms: exists
                ? state.platforms.filter(p => p !== platform)
                : [...state.platforms, platform]
        };
    }),

    addImage: (file) => set((state) => {
        const url = URL.createObjectURL(file);
        return {
            images: [...state.images, file],
            imageUrls: [...state.imageUrls, url]
        };
    }),

    removeImage: (index) => set((state) => {
        // Revoke the URL to avoid memory leaks
        URL.revokeObjectURL(state.imageUrls[index]);

        const newImages = [...state.images];
        newImages.splice(index, 1);

        const newUrls = [...state.imageUrls];
        newUrls.splice(index, 1);

        return { images: newImages, imageUrls: newUrls };
    }),

    reset: () => set({
        title: '',
        price: '',
        sku: '',
        description: '',
        platforms: [],
        images: [],
        imageUrls: []
    })
}));
