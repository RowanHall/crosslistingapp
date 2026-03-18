"use client";

import { useState, useEffect } from "react";

export interface SyncProgress {
    phase: 'fetching' | 'enriching' | 'saving' | 'done';
    current: number;
    total: number;
    message: string;
}

export function useFacebookSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [progress, setProgress] = useState<SyncProgress | null>(null);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting Facebook sync...");
        setProgress({ phase: 'fetching', current: 0, total: 0, message: 'Fetching listings...' });
        window.postMessage({ action: "SYNC_FACEBOOK" }, "*");
    };

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.data?.action !== "SYNC_COMPLETE_FACEBOOK") return;

            const { payload } = event.data;
            if (!payload) return;

            if (!payload.success) {
                setSyncStatus(`Sync failed: ${payload.error || "Unknown error"}`);
                setProgress(null);
                setIsSyncing(false);
                return;
            }

            const products = payload.products ?? [];
            const count = payload.count ?? products.length;

            try {
                setProgress({ phase: 'saving', current: count, total: count, message: 'Uploading images & saving...' });
                setSyncStatus(`Fetched ${count} listings. Uploading images...`);

                // Image re-hosting and DB upsert happen server-side in the sync route
                // so that Facebook CDN URLs (which expire) are replaced with permanent ones.
                const resp = await fetch("/api/integrations/facebook/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ products }),
                });

                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error ?? `Server error ${resp.status}`);
                }

                const result = await resp.json();

                setSyncStatus(`Success! Saved ${result.count} items.`);
                setProgress({ phase: 'done', current: count, total: count, message: `Saved ${result.count} items!` });

            } catch (err: any) {
                setSyncStatus(`Error: ${err.message}`);
                setProgress(null);
            }

            setIsSyncing(false);
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return { startSync, isSyncing, syncStatus, progress };
}
