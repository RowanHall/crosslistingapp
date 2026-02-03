"use client";

import { Button } from "@/components/ui/button";

interface CrossPostButtonProps {
    listing: {
        title: string;
        description: string;
        price: number;
        images: string[];
    };
}

export function CrossPostButton({ listing }: CrossPostButtonProps) {
    const handlePostToPoshmark = () => {
        console.log("Posting to Poshmark...", listing);
        window.postMessage({ 
            type: "CROSS_POST", 
            payload: { 
                title: listing.title, 
                description: listing.description, 
                price: listing.price, 
                images: listing.images 
            } 
        }, "*");
    };

    return (
        <Button 
            onClick={handlePostToPoshmark}
            className="bg-[#8f041b] hover:bg-[#720316] text-white font-bold tracking-wider"
        >
            LIST TO POSHMARK
        </Button>
    );
}
