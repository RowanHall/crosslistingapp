"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function useFacebookDelete() {
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const router = useRouter();

    const deleteListing = async (facebookListingId: string): Promise<boolean> => {
        setIsDeleting(true);
        setDeleteError(null);

        try {
            // Step 1: Send delete action to the extension via the window bridge.
            // content.js relays this to background.js → facebook-scraper.js.
            const extensionResult = await new Promise<{ success: boolean; error?: string }>(
                (resolve) => {
                    const handler = (event: MessageEvent) => {
                        if (event.source !== window) return;
                        if (event.data?.action !== "DELETE_COMPLETE_FACEBOOK") return;
                        window.removeEventListener("message", handler);
                        resolve(event.data.payload ?? { success: false, error: "No payload" });
                    };
                    window.addEventListener("message", handler);

                    // Post the delete request into the extension bridge
                    window.postMessage({ action: "INITIATE_FB_DELETE", listingId: facebookListingId }, "*");

                    // Safety timeout: if the extension doesn't respond in 15s, bail out
                    setTimeout(() => {
                        window.removeEventListener("message", handler);
                        resolve({ success: false, error: "Extension timed out. Is a Facebook tab open?" });
                    }, 15_000);
                }
            );

            if (!extensionResult.success) {
                throw new Error(extensionResult.error ?? "Extension failed to delete the listing");
            }

            // Step 2: Clean up the database now that FB confirmed deletion
            const dbResp = await fetch("/api/integrations/facebook/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platformId: facebookListingId }),
            });

            if (!dbResp.ok) {
                const err = await dbResp.json().catch(() => ({}));
                throw new Error(err.error ?? `DB cleanup failed (${dbResp.status})`);
            }

            // Step 3: Refresh the page data so the deleted listing disappears from the UI
            router.refresh();

            return true;

        } catch (err: any) {
            setDeleteError(err.message);
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    return { deleteListing, isDeleting, deleteError };
}
