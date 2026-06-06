/** @jest-environment node */
import {
    getShopifyHeaders,
    shopifyApiUrl,
    mapConditionToShopifyTag,
    verifyShopifyCredentials,
    listShopifyProducts,
    createShopifyProduct,
} from '@/lib/shopify';

describe('getShopifyHeaders', () => {
    it('includes the access token and JSON content type', () => {
        expect(getShopifyHeaders('shpat_abc')).toEqual({
            'X-Shopify-Access-Token': 'shpat_abc',
            'Content-Type': 'application/json',
        });
    });
});

describe('shopifyApiUrl', () => {
    it('builds an admin API URL pinned to the 2024-01 version', () => {
        expect(shopifyApiUrl('my-store.myshopify.com', 'products.json')).toBe(
            'https://my-store.myshopify.com/admin/api/2024-01/products.json'
        );
    });
});

describe('mapConditionToShopifyTag', () => {
    const cases: Array<[string, string]> = [
        ['NEW', 'condition:new'],
        ['USED_EXCELLENT', 'condition:used_excellent'],
        ['USED_GOOD', 'condition:used_good'],
        ['USED_FAIR', 'condition:used_fair'],
        ['anything-else', 'condition:used_good'],
        ['', 'condition:used_good'],
    ];

    it.each(cases)('maps %p -> %p', (input, expected) => {
        expect(mapConditionToShopifyTag(input)).toBe(expected);
    });
});

const auth = { storeUrl: 'my-store.myshopify.com', accessToken: 'shpat_abc' };

describe('verifyShopifyCredentials', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns the store name on success', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ shop: { name: 'Cool Store' } }),
        }) as any;

        await expect(verifyShopifyCredentials(auth)).resolves.toEqual({ storeName: 'Cool Store' });
    });

    it('falls back to the store URL when name is absent', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ shop: {} }) }) as any;
        await expect(verifyShopifyCredentials(auth)).resolves.toEqual({
            storeName: 'my-store.myshopify.com',
        });
    });

    it('returns null on a non-ok response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;
        await expect(verifyShopifyCredentials(auth)).resolves.toBeNull();
    });

    it('returns null when fetch throws', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as any;
        await expect(verifyShopifyCredentials(auth)).resolves.toBeNull();
    });
});

describe('listShopifyProducts', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns products from a single page', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({ products: [{ id: 1 }, { id: 2 }] }),
        }) as any;

        const products = await listShopifyProducts(auth);
        expect(products).toHaveLength(2);
    });

    it('follows the Link header rel="next" across pages', async () => {
        const page1 = {
            ok: true,
            headers: {
                get: (h: string) =>
                    h === 'Link'
                        ? '<https://my-store.myshopify.com/admin/api/2024-01/products.json?page_info=NEXT>; rel="next"'
                        : null,
            },
            json: async () => ({ products: [{ id: 1 }] }),
        };
        const page2 = {
            ok: true,
            headers: { get: () => null },
            json: async () => ({ products: [{ id: 2 }] }),
        };
        const fetchMock = jest.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
        global.fetch = fetchMock as any;

        const products = await listShopifyProducts(auth);
        expect(products.map((p) => p.id)).toEqual([1, 2]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenLastCalledWith(
            'https://my-store.myshopify.com/admin/api/2024-01/products.json?page_info=NEXT',
            expect.anything()
        );
    });

    it('throws on a failed fetch', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => 'rate limited',
        }) as any;

        await expect(listShopifyProducts(auth)).rejects.toThrow(/429/);
    });

    it('treats a missing products array as empty', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({}),
        }) as any;

        await expect(listShopifyProducts(auth)).resolves.toEqual([]);
    });
});

describe('createShopifyProduct', () => {
    afterEach(() => jest.restoreAllMocks());

    const input = {
        title: 'Tee',
        descriptionHtml: '<p>nice</p>',
        vendor: 'Acme',
        price: '49.99',
        images: ['https://img/1.jpg', 'https://img/2.jpg'],
        condition: 'USED_GOOD',
        size: 'M',
        tags: ['streetwear'],
    };

    it('posts a product and returns id + storefront URL', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ product: { id: 555, handle: 'tee' } }),
        });
        global.fetch = fetchMock as any;

        const result = await createShopifyProduct(auth, input);
        expect(result).toEqual({ id: 555, url: 'https://my-store.myshopify.com/products/tee' });

        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
        // condition tag is appended to the caller-supplied tags
        expect(body.product.tags).toBe('streetwear, condition:used_good');
        expect(body.product.images).toEqual([{ src: 'https://img/1.jpg' }, { src: 'https://img/2.jpg' }]);
        expect(body.product.variants[0].option1).toBe('M');
        expect(body.product.variants[0].price).toBe('49.99');
    });

    it('defaults vendor and size when missing', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ product: { id: 1, handle: 'h' } }),
        });
        global.fetch = fetchMock as any;

        await createShopifyProduct(auth, { ...input, vendor: '', size: null });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
        expect(body.product.vendor).toBe('Unknown');
        expect(body.product.variants[0].option1).toBe('One Size');
    });

    it('throws on a failed create', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 422,
            text: async () => 'validation error',
        }) as any;

        await expect(createShopifyProduct(auth, input)).rejects.toThrow(/422/);
    });
});
