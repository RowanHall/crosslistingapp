"use client";

import { useEbayCrosslist } from "@/hooks/useEbayCrosslist";
import { PlatformTicket, type TicketState } from "./PlatformTicket";

interface EbayCrosslistButtonProps {
    listing: {
        title: string;
        description?: string | null;
        price?: number | string | null;
        images?: string[] | null;
        brand?: string | null;
        condition?: string | null;
    };
}

export function EbayCrosslistButton({ listing }: EbayCrosslistButtonProps) {
    const { crosslistToEbay, isExporting, exportError, publishedItemId } = useEbayCrosslist();

    const isListed = !!publishedItemId;
    const resolvedUrl = publishedItemId ? `https://www.ebay.com/itm/${publishedItemId}` : null;

    const state: TicketState = isExporting
        ? "loading"
        : exportError
        ? "error"
        : isListed
        ? "listed"
        : "idle";

    return (
        <PlatformTicket
            brandColor="#E53238"
            iconPath="/platforms/ebay.png"
            platformName="eBay"
            ticketCode="EB · 003"
            state={state}
            isListed={isListed}
            resolvedUrl={resolvedUrl}
            errorMessage={exportError ?? null}
            viewLabel="View on eBay"
            onDispatch={() => crosslistToEbay(listing)}
        />
    );
}
