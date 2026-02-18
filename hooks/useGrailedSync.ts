import { useState, useEffect } from "react";
import { UniversalListing } from "@/lib/universal-listing";
import { saveUniversalListings } from "@/actions/listing";

export interface SyncProgress {
    phase: 'fetching' | 'enriching' | 'saving' | 'done';
    current: number;
    total: number;
    message: string;
}

export function useGrailedSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [listings, setListings] = useState<UniversalListing[]>([]);
    const [progress, setProgress] = useState<SyncProgress | null>(null);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting Grailed sync...");
        setListings([]); // Clear previous listings
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
                    const count = payload.count !== undefined ? payload.count : 0;

                    // Map raw data to UniversalListing
                    if (payload.products && Array.isArray(payload.products)) {
                        try {
                            const mappedListings = payload.products.map((item: any) =>
                                UniversalListing.fromGrailed(item)
                            );
                            setListings(mappedListings);
                            console.log("Hook: Mapped listings:", mappedListings);

                            // Save to Supabase (serialize to plain objects for server action)
                            setProgress({ phase: 'saving', current: count, total: count, message: 'Saving to database...' });
                            setSyncStatus(`Imported ${count} items. Saving to database...`);
                            const plainListings = mappedListings.map((l: UniversalListing) => l.toPlainObject());
                            const result = await saveUniversalListings(plainListings);

                            if (result.success) {
                                setSyncStatus(`Success! Saved ${result.count} items to database.`);
                                setProgress({ phase: 'done', current: count, total: count, message: `Saved ${result.count} items!` });
                            } else {
                                setSyncStatus("Imported items but failed to save to database.");
                                setProgress(null);
                            }

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

    return { startSync, isSyncing, syncStatus, listings, progress };
}
