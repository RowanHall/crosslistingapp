'use client';
import { useState, useCallback } from 'react';

interface CrosslistState {
    isLoading: boolean;
    isSuccess: boolean;
    error: string | null;
    listingUrl: string | null;
}

export function useShopifyCrosslist() {
    const [state, setState] = useState<CrosslistState>({
        isLoading: false,
        isSuccess: false,
        error: null,
        listingUrl: null,
    });

    const crosslist = useCallback(async (listingId: string, opts?: { force?: boolean }) => {
        setState({ isLoading: true, isSuccess: false, error: null, listingUrl: null });

        try {
            const response = await fetch('/api/crosslist/shopify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listingId, force: opts?.force ?? false }),
            });

            const data = await response.json();

            if (!response.ok) {
                const isAlreadyListed = data.code === 'ALREADY_LISTED';
                const msg = isAlreadyListed
                    ? 'This item is already listed on Shopify. Click "Update" to re-post.'
                    : data.error ?? 'Unknown error';
                setState({ isLoading: false, isSuccess: false, error: msg, listingUrl: data.listingUrl ?? null });
                return;
            }

            setState({ isLoading: false, isSuccess: true, error: null, listingUrl: data.listingUrl });
        } catch (err: any) {
            setState({ isLoading: false, isSuccess: false, error: err.message, listingUrl: null });
        }
    }, []);

    const reset = useCallback(() => {
        setState({ isLoading: false, isSuccess: false, error: null, listingUrl: null });
    }, []);

    return { ...state, crosslist, reset };
}
