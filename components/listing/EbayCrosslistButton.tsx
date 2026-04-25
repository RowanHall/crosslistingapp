"use client";

import { useEbayCrosslist } from "@/hooks/useEbayCrosslist";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ExternalLink, XCircle } from "lucide-react";

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

    return (
        <div className="flex flex-col items-start gap-2">
            <Button
                onClick={() => crosslistToEbay(listing)}
                disabled={isExporting}
                className="font-bold uppercase tracking-wider border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[4px] disabled:translate-y-[4px] bg-blue-600 hover:bg-blue-700 text-white"
            >
                {isExporting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Listing on eBay...
                    </>
                ) : publishedItemId ? (
                    <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Listed on eBay
                    </>
                ) : (
                    "List on eBay"
                )}
            </Button>

            {publishedItemId && (
                <a
                    href={`https://www.ebay.com/itm/${publishedItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-blue-700 hover:underline"
                >
                    <ExternalLink className="h-3 w-3" />
                    View on eBay
                </a>
            )}

            {exportError && (
                <div className="flex items-start gap-2 p-3 border-2 border-red-500 bg-red-50 max-w-xs">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                        {exportError}
                    </p>
                </div>
            )}
        </div>
    );
}
