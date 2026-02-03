"use client";

import { useEffect, useCallback } from 'react';

export function useExtension() {
    const sendMessageToExtension = useCallback((action: string, payload?: any) => {
        if (typeof window !== 'undefined') {
            // Send message to the parent window (the extension side panel host)
            window.parent.postMessage({ action, payload }, '*');
        }
    }, []);

    return { sendMessageToExtension };
}
