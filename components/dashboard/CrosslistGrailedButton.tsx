'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export function CrosslistGrailedButton() {
    const [listings, setListings] = useState<any[]>([]);
    const [isPosting, setIsPosting] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);

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

    const handleClick = async () => {
        if (listings.length === 0) {
            alert('No listings found. Sync your inventory first.');
            return;
        }

        const toPost = listings.filter(
            (l) => l.platforms_status?.grailed !== 'listed' && !l.grailed_listing_url
        );

        if (toPost.length === 0) {
            alert('All listings are already on Grailed.');
            return;
        }

        const confirmed = confirm(
            `This will post ${toPost.length} listing(s) to Grailed. Continue?`
        );
        if (!confirmed) return;

        setIsPosting(true);
        let succeeded = 0;
        let failed = 0;

        for (let i = 0; i < toPost.length; i++) {
            const listing = toPost[i];
            setProgress(`Posting ${i + 1}/${toPost.length}: ${listing.title}`);

            try {
                const response = await fetch('/api/crosslist/grailed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listingId: listing.id }),
                });

                if (response.ok) {
                    succeeded++;
                } else {
                    const data = await response.json();
                    console.error(`Failed to post "${listing.title}":`, data.error);
                    failed++;
                }
            } catch (err: any) {
                console.error(`Error posting "${listing.title}":`, err.message);
                failed++;
            }
        }

        setIsPosting(false);
        setProgress(null);
        alert(`Done! ${succeeded} posted, ${failed} failed.`);
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleClick}
                disabled={isPosting}
                className="px-4 py-2 text-sm font-bold uppercase tracking-wider bg-[#161616] hover:bg-[#2a2a2a] disabled:bg-gray-400 text-white rounded-md transition-colors"
            >
                {isPosting ? 'Posting...' : 'Crosslist to Grailed'}
            </button>
            {progress && (
                <span className="text-xs text-muted-foreground">{progress}</span>
            )}
        </div>
    );
}
