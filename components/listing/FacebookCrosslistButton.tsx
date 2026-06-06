"use client";

import { useFacebookCrosslist } from "@/hooks/useFacebookCrosslist";
import { PlatformTicket, type TicketState } from "./PlatformTicket";

interface FacebookCrosslistButtonProps {
  listingId: string;
  alreadyListed: boolean;
  existingUrl: string | null;
  note?: string | null;
}

export function FacebookCrosslistButton({
  listingId,
  alreadyListed,
  existingUrl,
  note,
}: FacebookCrosslistButtonProps) {
  const { isLoading, isSuccess, error, listingUrl, crosslist } =
    useFacebookCrosslist();

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
      ? "Session expired — revisit facebook.com to refresh"
      : error;

  return (
    <PlatformTicket
      brandColor="#1877F2"
      iconPath="/platforms/facebook2.svg"
      platformName="Facebook Marketplace"
      ticketCode="FB · 001"
      state={state}
      isListed={isListed}
      resolvedUrl={resolvedUrl}
      errorMessage={friendlyError ?? null}
      viewLabel="View on Marketplace"
      onDispatch={() => crosslist(listingId)}
      note={note ?? null}
    />
  );
}
