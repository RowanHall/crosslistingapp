'use client';
import { useState, useEffect, useCallback } from 'react';

interface CrosslistProgress {
    current: number;
    total: number;
    message: string;
}

interface CrosslistResult {
    success: boolean;
    error?: string;
}

export function useDepopCrosslist() {
    const [isCrosslisting, setIsCrosslisting] = useState(false);
    const [progress, setProgress] = useState<CrosslistProgress | null>(null);
    const [results, setResults] = useState<CrosslistResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== window) return;

            if (event.data?.action === 'CROSSLIST_DEPOP_PROGRESS') {
                setProgress(event.data.progress);
            }

            if (event.data?.action === 'CROSSLIST_DEPOP_DONE') {
                setIsCrosslisting(false);
                setResults(event.data.results);
                setProgress({
                    current: event.data.total,
                    total: event.data.total,
                    message: `Done! ${event.data.successCount}/${event.data.total} posted successfully.`
                });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const startCrosslist = useCallback((listings: any[]) => {
        setIsCrosslisting(true);
        setError(null);
        setResults(null);
        setProgress({ current: 0, total: listings.length, message: 'Starting crosslist...' });

        window.postMessage({
            action: 'CROSSLIST_DEPOP',
            listings: listings
        }, '*');
    }, []);

    return {
        isCrosslisting,
        progress,
        results,
        error,
        startCrosslist,
    };
}
