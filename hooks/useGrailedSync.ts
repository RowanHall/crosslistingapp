import { useState, useEffect } from "react";

export interface SyncProgress {
    phase: 'fetching' | 'enriching' | 'saving' | 'done';
    current: number;
    total: number;
    message: string;
}

export function useGrailedSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [progress, setProgress] = useState<SyncProgress | null>(null);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting Grailed sync...");
setProgress({ phase: 'fetching', current: 0, total: 0, message: 'Starting sync...' });
        console.log("Hook: Sending SYNC_GRAILED request...");

        window.postMessage({ action: "SYNC_GRAILED" }, "*");
    };

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.source !== window) return;

            // Handle progress updates
            if (event.data?.action === "GRAILED_SYNC_PROGRESS") {
                const prog = event.data.progress as SyncProgress;
                setProgress(prog);
                setSyncStatus(prog.message);
                return;
            }

            if (event.data?.action === "SYNC_COMPLETE_GRAILED") {
                console.log("Hook (Grailed): Received response!", event.data);

                const { payload } = event.data;

                if (!payload) {
                    return;
                }

                if (payload.success) {
                    const products = payload.products ?? [];
                    const count = payload.count ?? products.length;

                    if (products.length > 0) {
                        try {
                            setProgress({ phase: 'saving', current: count, total: count, message: 'Uploading images & saving...' });
                            setSyncStatus(`Fetched ${count} listings. Uploading images...`);

                            // Image re-hosting and DB upsert happen server-side so that
                            // Grailed CDN URLs (which can expire) are replaced with
                            // permanent Supabase Storage URLs.
                            const resp = await fetch("/api/integrations/grailed/sync", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ products }),
                            });

                            if (!resp.ok) {
                                const err = await resp.json().catch(() => ({}));
                                throw new Error(err.error ?? `Server error ${resp.status}`);
                            }

                            const result = await resp.json();

                            setSyncStatus(`Success! Saved ${result.count} items to database.`);
                            setProgress({ phase: 'done', current: count, total: count, message: `Saved ${result.count} items!` });

                        } catch (err: any) {
                            console.error("Hook: Error processing listings:", err);
                            setSyncStatus(`Error: ${err.message}`);
                            setProgress(null);
                        }
                    } else {
                        setSyncStatus(`Success! Imported ${count} items (No product data).`);
                        setProgress({ phase: 'done', current: count, total: count, message: `Imported ${count} items.` });
                    }

                } else {
                    setSyncStatus(`Sync failed: ${payload.error || "Unknown error"}`);
                    setProgress(null);
                }

                setIsSyncing(false);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return { startSync, isSyncing, syncStatus, progress };
}
