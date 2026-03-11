'use client';
import { useEffect, useState } from 'react';
import { useDepopCrosslist } from '@/hooks/useDepopCrosslist';
import { createClient } from '@/utils/supabase/client';

export function CrosslistDepopButton() {
    const { isCrosslisting, progress, startCrosslist } = useDepopCrosslist();
    const [listings, setListings] = useState<any[]>([]);

    // Fetch full listing data from Supabase on mount
    useEffect(() => {
        const fetchListings = async () => {
            const supabase = createClient();
            const { data } = await supabase
                .from('listings')
                .select('*')
                .order('created_at', { ascending: false });
            setListings(data || []);
        };
        fetchListings();
    }, []);

    const handleClick = () => {
        if (listings.length === 0) {
            alert('No listings to crosspost. Sync your inventory first.');
            return;
        }

        // Filter to only listings NOT already on Depop
        const nonDepop = listings.filter(
            (l) => l.source !== 'depop' && !(l.platforms_status?.depop)
        );

        if (nonDepop.length === 0) {
            alert('All listings are already from Depop or already crosslisted.');
            return;
        }

        const confirmed = confirm(
            `This will post ${nonDepop.length} listing(s) to Depop. Continue?`
        );
        if (!confirmed) return;

        // Map DB records to the shape the filler needs
        const forFiller = nonDepop.map((l) => ({
            title: l.title,
            description: l.description,
            price: l.price,
            images: l.images || [],
            brand: l.brand,
            condition: l.condition,
            size: l.size,
        }));

        startCrosslist(forFiller);
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleClick}
                disabled={isCrosslisting}
                className="px-4 py-2 text-sm font-bold uppercase tracking-wider bg-[#FF2300] hover:bg-[#E01F00] disabled:bg-gray-400 text-white rounded-md transition-colors"
            >
                {isCrosslisting ? 'Posting...' : 'Crosslist to Depop'}
            </button>
            {progress && (
                <span className="text-xs text-muted-foreground">
                    {progress.message}
                </span>
            )}
        </div>
    );
}
