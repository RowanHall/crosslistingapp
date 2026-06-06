"use client";

import { useShopifyCrosslist } from "@/hooks/useShopifyCrosslist";
import { PlatformTicket, type TicketState } from "./PlatformTicket";

interface ShopifyCrosslistButtonProps {
    listingId: string;
    alreadyListed: boolean;
    existingUrl: string | null;
    note?: string | null;
}

export function ShopifyCrosslistButton({
    listingId,
    alreadyListed,
    existingUrl,
    note,
}: ShopifyCrosslistButtonProps) {
    const { isLoading, isSuccess, error, listingUrl, crosslist } = useShopifyCrosslist();

    const resolvedUrl = listingUrl ?? existingUrl;
    const isListed = isSuccess || (alreadyListed && !isLoading && !error);

    const state: TicketState = isLoading
        ? "loading"
        : error
        ? "error"
        : isListed
        ? "listed"
        : "idle";

    return (
        <PlatformTicket
            brandColor="#95BF47"
            iconPath="/platforms/shopify.svg"
            platformName="Shopify"
            ticketCode="SH · 004"
            state={state}
            isListed={isListed}
            resolvedUrl={resolvedUrl}
            errorMessage={error ?? null}
            viewLabel="View in Shopify admin"
            onDispatch={() => crosslist(listingId)}
            note={note ?? null}
        />
    );
}
