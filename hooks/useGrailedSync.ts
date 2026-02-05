import { useState, useEffect } from "react";

export function useGrailedSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    const startSync = () => {
        setIsSyncing(true);
        setSyncStatus("Starting Grailed sync...");
        console.log("Hook: Sending SYNC_GRAILED request...");

        window.postMessage({ action: "SYNC_GRAILED" }, "*");
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== window) return;

            if (event.data?.action === "SYNC_COMPLETE_GRAILED") {
                console.log("Hook (Grailed): Received response!", event.data);

                const { payload } = event.data;

                if (!payload) {
                    return;
                }

                if (payload.success) {
                    const count = payload.count !== undefined ? payload.count : 0;
                    setSyncStatus(`Success! Imported ${count} items from Grailed.`);
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
