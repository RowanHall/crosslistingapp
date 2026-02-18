import { useState, useEffect } from "react";
import { UniversalListing } from "@/lib/universal-listing";
import { saveUniversalListings } from "@/actions/listing";

export function useDepopSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [listings, setListings] = useState<UniversalListing[]>([]);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting Depop sync...");
        setListings([]);
        console.log("Hook: Sending SYNC_DEPOP request...");

        window.postMessage({ action: "SYNC_DEPOP" }, "*");
    };

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.source !== window) return;

            if (event.data?.action === "SYNC_COMPLETE_DEPOP") {
                console.log("Hook (Depop): Received response!", event.data);

                const { payload } = event.data;

                if (!payload) {
                    setSyncStatus("Error: No response from extension");
                    setIsSyncing(false);
                    return;
                }

                if (payload.success) {
                    const count = payload.count !== undefined ? payload.count : 0;

                    if (payload.products && Array.isArray(payload.products)) {
                        try {
                            const mappedListings = payload.products.map((item: any) =>
                                UniversalListing.fromDepop(item)
                            );
                            setListings(mappedListings);
                            console.log("Hook (Depop): Mapped listings:", mappedListings);

                            // Save to Supabase
                            setSyncStatus(`Imported ${count} items. Saving to database...`);
                            const plainListings = mappedListings.map((l: UniversalListing) => l.toPlainObject());
                            const result = await saveUniversalListings(plainListings);

                            if (result.success) {
                                setSyncStatus(`Success! Saved ${result.count} items to database.`);
                            } else {
                                setSyncStatus("Imported items but failed to save to database.");
                            }
                        } catch (err: any) {
                            console.error("Hook (Depop): Error processing listings:", err);
                            setSyncStatus(`Error: ${err.message}`);
                        }
                    } else {
                        setSyncStatus(`Success! Imported ${count} items (No product data).`);
                    }
                } else {
                    setSyncStatus(`Sync failed: ${payload.error || "Unknown error"}`);
                }

                setIsSyncing(false);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return { startSync, isSyncing, syncStatus, listings };
}