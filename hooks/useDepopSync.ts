import { useState, useEffect } from "react";

export function useDepopSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting sync...");
        console.log("Hook: Sending SYNC_DEPOP request...");

        // FIX 1: Change 'type' to 'action' to match content.js
        window.postMessage({ action: "SYNC_DEPOP" }, "*");
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Validate origin (security)
            if (event.source !== window) return;

            // FIX 2: Listen for 'SYNC_COMPLETE' (This is what content.js sends back)
            if (event.data?.action === "SYNC_COMPLETE") {
                console.log("Hook: Received response!", event.data);

                const { payload } = event.data;

                // Safety check in case payload is undefined
                if (!payload) {
                    setSyncStatus("Error: No response from extension");
                    setIsSyncing(false);
                    return;
                }

                if (payload.success) {
                    const count = payload.count !== undefined ? payload.count : 0;
                    setSyncStatus(`Success! Imported ${count} items.`);
                } else {
                    setSyncStatus(`Sync failed: ${payload.error || "Unknown error"}`);
                }

                setIsSyncing(false);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return { startSync, isSyncing, syncStatus };
}