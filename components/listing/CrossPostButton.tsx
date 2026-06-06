"use client";

import { PlatformTicket } from "./PlatformTicket";

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
        window.postMessage(
            {
                type: "CROSS_POST",
                payload: {
                    title: listing.title,
                    description: listing.description,
                    price: listing.price,
                    images: listing.images,
                },
            },
            "*"
        );
    };

    return (
        <PlatformTicket
            brandColor="#8F041B"
            monogram="PSH"
            platformName="Poshmark"
            ticketCode="PM · 005"
            state="idle"
            staticAction
            ctaIdle="Send to Extension"
            onDispatch={handlePostToPoshmark}
        />
    );
}
