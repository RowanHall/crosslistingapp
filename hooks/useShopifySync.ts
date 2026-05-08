'use client';
import { useState, useCallback } from 'react';

export function useShopifySync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    const startSync = useCallback(async () => {
        setIsSyncing(true);
        setSyncStatus(null);

        try {
            const response = await fetch('/api/integrations/shopify/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();

            if (!response.ok) {
                setSyncStatus(`Error: ${data.error ?? 'Unknown error'}`);
            } else {
                setSyncStatus(`Success: ${data.count} products synced`);
            }
        } catch (err: any) {
            setSyncStatus(`Error: ${err.message}`);
        } finally {
            setIsSyncing(false);
        }
    }, []);

    return { isSyncing, syncStatus, startSync };
}
