/** @jest-environment node */
import {
    mapConditionToFB,
    uploadFBPhoto,
    createFBMarketplaceListing,
} from '@/lib/facebook-marketplace';

// The lib logs verbosely on the happy/error paths; silence it for clean output.
// Re-applied per test because the per-describe afterEach restores all mocks.
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('mapConditionToFB', () => {
    const cases: Array<[string | null | undefined, string]> = [
        [undefined, 'used_good'],
        [null, 'used_good'],
        ['', 'used_good'],
        ['new', 'new'],
        ['NEW', 'new'],
        ['brand new', 'new'],
        ['like new', 'used_like_new'],
        ['like_new', 'used_like_new'],
        // 'is_new' contains 'new' and not 'like', so the earlier `new` branch wins
        ['is_new', 'new'],
        ['fair', 'used_fair'],
        ['poor', 'used_fair'],
        ['worn', 'used_fair'],
        ['good', 'used_good'],
        ['excellent', 'used_good'],
    ];

    it.each(cases)('maps %p -> %p', (input, expected) => {
        expect(mapConditionToFB(input)).toBe(expected);
    });
});

const auth = { cookies: 'c=1', fbDtsg: 'dtsg', lsd: 'lsd', userId: '12345' };

describe('uploadFBPhoto', () => {
    afterEach(() => jest.restoreAllMocks());

    function mockImageFetch() {
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => new ArrayBuffer(8),
        };
    }

    it('throws when the source image cannot be fetched', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
        await expect(uploadFBPhoto('https://img/x.png', auth)).rejects.toThrow(/Failed to fetch image/);
    });

    it('strips the for(;;); prefix and returns payload.photoID', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(mockImageFetch())
            .mockResolvedValueOnce({
                status: 200,
                text: async () => 'for (;;);' + JSON.stringify({ payload: { photoID: 'photo-1' } }),
            });
        global.fetch = global.fetch as any;

        await expect(uploadFBPhoto('https://img/x.png', auth)).resolves.toBe('photo-1');
    });

    it('falls back to payload.fbid when photoID is absent', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(mockImageFetch())
            .mockResolvedValueOnce({
                status: 200,
                text: async () => JSON.stringify({ payload: { fbid: 'fb-9' } }),
            }) as any;

        await expect(uploadFBPhoto('https://img/x.png', auth)).resolves.toBe('fb-9');
    });

    it('throws on a non-JSON upload response', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(mockImageFetch())
            .mockResolvedValueOnce({ status: 500, text: async () => '<html>error</html>' }) as any;

        await expect(uploadFBPhoto('https://img/x.png', auth)).rejects.toThrow(/non-JSON response/);
    });

    it('throws when Facebook reports an error code', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(mockImageFetch())
            .mockResolvedValueOnce({
                status: 200,
                text: async () => JSON.stringify({ error: 1357004, errorSummary: 'Sorry' }),
            }) as any;

        await expect(uploadFBPhoto('https://img/x.png', auth)).rejects.toThrow(/1357004/);
    });

    it('throws when no photo id is found in a successful response', async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(mockImageFetch())
            .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ payload: {} }) }) as any;

        await expect(uploadFBPhoto('https://img/x.png', auth)).rejects.toThrow(/no photo ID/);
    });
});

describe('createFBMarketplaceListing', () => {
    afterEach(() => jest.restoreAllMocks());

    const listing = {
        title: 'Cool Jacket',
        description: 'Great condition',
        price: '49.50',
        currency: 'USD',
        photoIds: ['p1'],
        categoryId: 'cat1',
        condition: 'used_good',
        latitude: 40,
        longitude: -73,
    };

    it('rounds the price and sends the GraphQL mutation', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: async () => JSON.stringify({ data: { ok: true } }),
        });
        global.fetch = fetchMock as any;

        const result = await createFBMarketplaceListing(auth, listing);
        expect(result).toEqual({ data: { ok: true } });

        const sentBody = (fetchMock.mock.calls[0][1] as any).body as string;
        const params = new URLSearchParams(sentBody);
        const variables = JSON.parse(params.get('variables')!);
        // "49.50" rounds to "50"
        expect(variables.input.data.common.item_price.price).toBe('50');
        expect(variables.input.data.common.title).toBe('Cool Jacket');
    });

    it('truncates titles longer than 100 characters', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: async () => 'for (;;);' + JSON.stringify({ data: {} }),
        });
        global.fetch = fetchMock as any;

        await createFBMarketplaceListing(auth, { ...listing, title: 'x'.repeat(150) });
        const params = new URLSearchParams((fetchMock.mock.calls[0][1] as any).body);
        const variables = JSON.parse(params.get('variables')!);
        expect(variables.input.data.common.title).toHaveLength(100);
    });

    it('throws on a non-JSON response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 500,
            statusText: 'Server Error',
            headers: new Map(),
            text: async () => '<html>nope</html>',
        }) as any;

        await expect(createFBMarketplaceListing(auth, listing)).rejects.toThrow(/Non-JSON response/);
    });

    it('throws when Facebook returns a top-level error', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: async () => JSON.stringify({ error: 1675030, errorSummary: 'Something went wrong' }),
        }) as any;

        await expect(createFBMarketplaceListing(auth, listing)).rejects.toThrow(/1675030/);
    });

    it('throws when Facebook returns a GraphQL errors array (200 OK)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: async () => JSON.stringify({ errors: [{ message: 'bad field' }, {}] }),
        }) as any;

        await expect(createFBMarketplaceListing(auth, listing)).rejects.toThrow(/bad field/);
    });
});
