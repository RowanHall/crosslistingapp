"use client";

import { useDepopCrosslist } from "@/hooks/useDepopCrosslist";
import { PlatformTicket, type TicketState } from "./PlatformTicket";

interface DepopCrosslistButtonProps {
    listingId: string;
    alreadyListed: boolean;
    isDepopSource: boolean;
    listing: {
        title: string;
        description: string | null;
        price: number;
        images: string[];
        brand: string | null;
        condition: string | null;
        size: string | null;
    };
}

export function DepopCrosslistButton({
    alreadyListed,
    isDepopSource,
    listing,
}: DepopCrosslistButtonProps) {
    const { isCrosslisting, results, error, startCrosslist } = useDepopCrosslist();

    const lastResult = results?.[0];
    const justFailed = !isCrosslisting && lastResult && !lastResult.success;
    const justSucceeded = !isCrosslisting && lastResult?.success === true;

    const isListed = justSucceeded || alreadyListed;

    const state: TicketState = isCrosslisting
        ? "loading"
        : justFailed || error
        ? "error"
        : isListed
        ? "listed"
        : "idle";

    const errorMessage =
        error ?? (justFailed ? lastResult?.error ?? "Depop post failed" : null);

    const handleDispatch = () => {
        if (isDepopSource) return;
        startCrosslist([
            {
                title: listing.title,
                description: listing.description ?? "",
                price: listing.price,
                images: listing.images ?? [],
                brand: listing.brand ?? "",
                condition: listing.condition ?? "",
                size: listing.size ?? "",
            },
        ]);
    };

    return (
        <PlatformTicket
            brandColor="#FF2300"
            iconPath="/platforms/depop.png"
            platformName="Depop"
            ticketCode="DP · 006"
            state={state}
            isListed={isListed}
            errorMessage={errorMessage}
            ctaIdle={isDepopSource ? "Imported from Depop" : "List it"}
            viewLabel="View on Depop"
            onDispatch={handleDispatch}
        />
    );
}
