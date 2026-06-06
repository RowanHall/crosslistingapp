"use client";

import { useGrailedCrosslist } from "@/hooks/useGrailedCrosslist";
import { PlatformTicket, type TicketState } from "./PlatformTicket";

interface GrailedCrosslistButtonProps {
    listingId: string;
    alreadyListed: boolean;
    existingUrl: string | null;
    note?: string | null;
}

export function GrailedCrosslistButton({
    listingId,
    alreadyListed,
    existingUrl,
    note,
}: GrailedCrosslistButtonProps) {
    const { isLoading, isSuccess, error, listingUrl, crosslist } = useGrailedCrosslist();

    const resolvedUrl = listingUrl ?? existingUrl;
    const isListed = isSuccess || (alreadyListed && !isLoading && !error);

    const state: TicketState = isLoading
        ? "loading"
        : error
        ? "error"
        : isListed
        ? "listed"
        : "idle";

    const friendlyError =
        error &&
        (error.toLowerCase().includes("session") ||
            error.toLowerCase().includes("not connected"))
            ? "Session expired — revisit grailed.com to refresh"
            : error;

    return (
        <PlatformTicket
            brandColor="#161616"
            iconPath="/platforms/grailed.png"
            platformName="Grailed"
            ticketCode="GR · 002"
            state={state}
            isListed={isListed}
            resolvedUrl={resolvedUrl}
            errorMessage={friendlyError ?? null}
            viewLabel="View on Grailed"
            onDispatch={() => crosslist(listingId)}
            note={note ?? null}
        />
    );
}
