"use client";

import { useFacebookCrosslist } from "@/hooks/useFacebookCrosslist";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ExternalLink, XCircle } from "lucide-react";

interface FacebookCrosslistButtonProps {
  listingId: string;
  alreadyListed: boolean;
  existingUrl: string | null;
}

export function FacebookCrosslistButton({
  listingId,
  alreadyListed,
  existingUrl,
}: FacebookCrosslistButtonProps) {
  const { isLoading, isSuccess, error, listingUrl, crosslist } =
    useFacebookCrosslist();

  const handleClick = () => {
    crosslist(listingId);
  };

  const resolvedUrl = listingUrl ?? existingUrl;
  const showSuccess = isSuccess || (alreadyListed && !isLoading && !error);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={handleClick}
        disabled={isLoading}
        className="font-bold uppercase tracking-wider border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[4px] disabled:translate-y-[4px] bg-[#1877F2] hover:bg-[#166FE5] text-white"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Listing...
          </>
        ) : showSuccess ? (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {alreadyListed && !isSuccess
              ? "Re-list on Facebook"
              : "Listed on Facebook"}
          </>
        ) : (
          "List on Facebook Marketplace"
        )}
      </Button>

      {/* Success: link to live listing */}
      {resolvedUrl && (isSuccess || alreadyListed) && (
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-green-700 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View on Facebook Marketplace
        </a>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 p-3 border-2 border-red-500 bg-red-50 max-w-xs">
          <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
            {error.toLowerCase().includes("session") ||
            error.toLowerCase().includes("not connected")
              ? "Session expired — re-visit facebook.com to refresh"
              : error}
          </p>
        </div>
      )}
    </div>
  );
}
