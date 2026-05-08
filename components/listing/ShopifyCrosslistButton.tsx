"use client";

import { useShopifyCrosslist } from "@/hooks/useShopifyCrosslist";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ExternalLink, XCircle } from "lucide-react";

interface ShopifyCrosslistButtonProps {
    listingId: string;
    alreadyListed: boolean;
    existingUrl: string | null;
}

export function ShopifyCrosslistButton({
    listingId,
    alreadyListed,
    existingUrl,
}: ShopifyCrosslistButtonProps) {
    const { isLoading, isSuccess, error, listingUrl, crosslist } = useShopifyCrosslist();

    const resolvedUrl = listingUrl ?? existingUrl;
    const showSuccess = isSuccess || (alreadyListed && !isLoading && !error);

    return (
        <div className="flex flex-col items-start gap-2">
            <Button
                onClick={() => crosslist(listingId)}
                disabled={isLoading}
                className="rounded-none bg-primary text-primary-foreground hover:opacity-90 font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Listing...
                    </>
                ) : showSuccess ? (
                    <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {alreadyListed && !isSuccess ? "Re-list on Shopify" : "Listed on Shopify"}
                    </>
                ) : (
                    "List on Shopify"
                )}
            </Button>

            {resolvedUrl && (isSuccess || alreadyListed) && (
                <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary hover:underline"
                >
                    <ExternalLink className="h-3 w-3" />
                    View on Shopify
                </a>
            )}

            {error && (
                <div className="flex items-start gap-2 p-3 border border-red-500 bg-red-50 max-w-xs">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                        {error}
                    </p>
                </div>
            )}
        </div>
    );
}
