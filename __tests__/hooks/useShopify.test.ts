import { renderHook, act, waitFor } from '@testing-library/react';
import { useShopifySync } from '@/hooks/useShopifySync';
import { useShopifyCrosslist } from '@/hooks/useShopifyCrosslist';

afterEach(() => jest.restoreAllMocks());

describe('useShopifySync', () => {
    it('reports success with the synced count', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 7 }) }) as any;
        const { result } = renderHook(() => useShopifySync());

        await act(async () => {
            await result.current.startSync();
        });

        expect(result.current.isSyncing).toBe(false);
        expect(result.current.syncStatus).toBe('Success: 7 products synced');
    });

    it('reports the server error message on a non-ok response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'no store' }) }) as any;
        const { result } = renderHook(() => useShopifySync());

        await act(async () => {
            await result.current.startSync();
        });

        expect(result.current.syncStatus).toBe('Error: no store');
    });

    it('reports network errors thrown by fetch', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
        const { result } = renderHook(() => useShopifySync());

        await act(async () => {
            await result.current.startSync();
        });

        expect(result.current.syncStatus).toBe('Error: offline');
    });
});

describe('useShopifyCrosslist', () => {
    it('sets success state and listing URL on success', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ listingUrl: 'https://shop/p/1' }) }) as any;
        const { result } = renderHook(() => useShopifyCrosslist());

        await act(async () => {
            await result.current.crosslist('listing-1');
        });

        expect(result.current.isSuccess).toBe(true);
        expect(result.current.listingUrl).toBe('https://shop/p/1');
        expect(result.current.error).toBeNull();
    });

    it('shows a friendly message for the ALREADY_LISTED code', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ code: 'ALREADY_LISTED', listingUrl: 'https://shop/p/old' }),
        }) as any;
        const { result } = renderHook(() => useShopifyCrosslist());

        await act(async () => {
            await result.current.crosslist('listing-1');
        });

        expect(result.current.error).toMatch(/already listed on Shopify/i);
        expect(result.current.listingUrl).toBe('https://shop/p/old');
    });

    it('surfaces a generic error message otherwise', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) }) as any;
        const { result } = renderHook(() => useShopifyCrosslist());

        await act(async () => {
            await result.current.crosslist('listing-1');
        });

        expect(result.current.error).toBe('boom');
    });

    it('passes the force flag through to the request body', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ listingUrl: 'u' }) });
        global.fetch = fetchMock as any;
        const { result } = renderHook(() => useShopifyCrosslist());

        await act(async () => {
            await result.current.crosslist('listing-1', { force: true });
        });

        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
        expect(body).toEqual({ listingId: 'listing-1', force: true });
    });

    it('reset clears state back to idle', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ listingUrl: 'u' }) }) as any;
        const { result } = renderHook(() => useShopifyCrosslist());

        await act(async () => {
            await result.current.crosslist('listing-1');
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        act(() => result.current.reset());
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.listingUrl).toBeNull();
    });
});
