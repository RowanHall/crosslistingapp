import { useState, useEffect } from "react";

interface EbayAspect {
    name: string;
    value: string[];
}

interface EbayPayload {
    title: string;
    description: string;
    price: number;
    images: string[];
    aspects: EbayAspect[];
}

// Maps our DB condition strings to human-readable eBay aspect values
function conditionToAspect(condition: string | null | undefined): string | null {
    if (!condition) return null;
    const map: Record<string, string> = {
        is_new: "New with tags",
        is_gently_used: "Pre-owned",
        is_used: "Pre-owned",
        is_heavily_used: "Pre-owned",
        new: "New with tags",
        used: "Pre-owned",
    };
    return map[condition.toLowerCase()] ?? null;
}

export function useEbayCrosslist() {
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [publishedItemId, setPublishedItemId] = useState<string | null>(null);

    // Global listener for the async publish success notification.
    // background.js → content.js → window.postMessage → here.
    useEffect(() => {
        const handleGlobalMessage = (event: MessageEvent) => {
            if (event.source !== window) return;

            if (event.data?.action === "EBAY_PUBLISH_SUCCESS") {
                console.log("useEbayCrosslist: eBay listing published! itemId=", event.data.itemId);
                setPublishedItemId(event.data.itemId ?? null);
                setIsExporting(false);
                setExportError(null);
            }
        };

        window.addEventListener("message", handleGlobalMessage);
        return () => window.removeEventListener("message", handleGlobalMessage);
    }, []);

    const crosslistToEbay = (listing: {
        title: string;
        description?: string | null;
        price?: number | string | null;
        images?: string[] | null;
        brand?: string | null;
        condition?: string | null;
    }) => {
        setIsExporting(true);
        setExportError(null);
        setPublishedItemId(null);

        // Build aspect list from available metadata
        const aspects: EbayAspect[] = [];

        if (listing.brand) {
            aspects.push({ name: "Brand", value: [listing.brand] });
        }

        const conditionValue = conditionToAspect(listing.condition);
        if (conditionValue) {
            aspects.push({ name: "Condition", value: [conditionValue] });
        }

        const rawPrice = listing.price;
        const numericPrice =
            typeof rawPrice === "number"
                ? rawPrice
                : rawPrice
                ? parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""))
                : 0;

        const payload: EbayPayload = {
            title: listing.title,
            description: listing.description ?? "",
            price: isNaN(numericPrice) ? 0 : numericPrice,
            images: listing.images ?? [],
            aspects,
        };

        // Listen for the initial ack (tab opened) from content.js
        const handleAck = (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.data?.action === "CROSSLIST_TO_EBAY_STARTED") {
                window.removeEventListener("message", handleAck);
                clearTimeout(ackTimeout);

                if (!event.data?.payload?.success) {
                    setExportError(event.data?.payload?.error ?? "Failed to open eBay tab");
                    setIsExporting(false);
                }
                // On success: stay in isExporting=true — the EBAY_PUBLISH_SUCCESS
                // message (or a publish error) will clear it when the flow completes.
            }
        };

        window.addEventListener("message", handleAck);

        // Safety timeout — if extension never acks the tab open, bail out
        const ackTimeout = setTimeout(() => {
            window.removeEventListener("message", handleAck);
            setIsExporting(false);
            setExportError("Extension did not respond. Is the extension installed and enabled?");
        }, 10_000);

        window.postMessage({ action: "CROSSLIST_TO_EBAY", payload }, "*");
        // background.js opens https://www.ebay.com/sl/prelist/suggest?title=...
        // Phase 1 auto-clicks the first category → redirect to /sl/list/v2
        // Phase 2 fills the draft and calls the publish endpoint, then signals back here.
    };

    return { crosslistToEbay, isExporting, exportError, publishedItemId };
}
