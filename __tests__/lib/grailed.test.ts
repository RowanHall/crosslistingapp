/** @jest-environment node */
import {
    mapConditionToGrailed,
    mapCategoryPath,
    getGrailedCSRFToken,
    getGrailedReturnAddressId,
    searchGrailedDesigner,
} from '@/lib/grailed';

describe('mapConditionToGrailed', () => {
    const cases: Array<[string | null | undefined, string]> = [
        [undefined, 'is_used'],
        [null, 'is_used'],
        ['', 'is_used'],
        ['new', 'is_new'],
        ['NEW', 'is_new'],
        ['new_with_tags', 'is_new'],
        ['nwt', 'is_new'],
        ['is_new', 'is_new'],
        ['like_new', 'is_gently_used'],
        ['like new', 'is_gently_used'],
        ['nwot', 'is_gently_used'],
        ['new_without_tags', 'is_gently_used'],
        ['is_gently_used', 'is_gently_used'],
        ['excellent', 'is_gently_used'],
        ['used_excellent', 'is_gently_used'],
        ['fair', 'is_heavily_used'],
        ['poor', 'is_heavily_used'],
        ['worn', 'is_heavily_used'],
        ['used_fair', 'is_heavily_used'],
        ['is_heavily_used', 'is_heavily_used'],
        ['used_good', 'is_used'],
        ['something_unknown', 'is_used'],
    ];

    it.each(cases)('maps %p -> %p', (input, expected) => {
        expect(mapConditionToGrailed(input)).toBe(expected);
    });
});

describe('mapCategoryPath', () => {
    const cases: Array<[string, string]> = [
        ['Vintage bomber jacket', 'outerwear.bombers'],
        ['Black leather jacket', 'outerwear.leather_jackets'],
        ['Winter parka', 'outerwear.parkas'],
        ['Rain windbreaker', 'outerwear.raincoats'],
        ['Down puffer', 'outerwear.heavy_coats'],
        ['Wool overcoat', 'outerwear.heavy_coats'],
        ['Light jacket', 'outerwear.light_jackets'],
        ['Quilted vest', 'outerwear.vests'],
        ['Champion hoodie', 'tops.sweatshirts_hoodies'],
        ['Crewneck sweatshirt', 'tops.sweatshirts_hoodies'],
        ['Knit cardigan sweater', 'tops.sweaters_knitwear'],
        ['Ralph Lauren polo', 'tops.polos'],
        ['Oxford button-up', 'tops.button_ups'],
        ['Basketball jersey', 'tops.jerseys'],
        ['Selvedge denim jeans', 'bottoms.denim'],
        ['Nike joggers', 'bottoms.sweatpants_joggers'],
        ['Chinos trousers', 'bottoms.casual_pants'],
        ['Cargo shorts', 'bottoms.shorts'],
        ['Chelsea boot', 'footwear.boots'],
        ['Jordan sneaker', 'footwear.hitop_sneakers'],
        ['Gucci loafer', 'footwear.slip_ons'],
        ['Running shoe', 'footwear.lowtop_sneakers'],
        ['New Era cap', 'accessories.hats'],
        ['Leather tote bag', 'accessories.bags_luggage'],
        ['Bifold wallet', 'accessories.wallets'],
        ['Leather belt', 'accessories.belts'],
        ['Diamond necklace', 'accessories.jewelry_watches'],
        ['Ray-Ban sunglasses', 'accessories.sunglasses'],
        ['Graphic tee', 'tops.short_sleeve_shirts'],
    ];

    it.each(cases)('classifies %p -> %p', (text, expected) => {
        expect(mapCategoryPath({ title: text })).toBe(expected);
    });

    it('falls back to short sleeve shirts when nothing matches', () => {
        expect(mapCategoryPath({ title: 'mystery object' })).toBe('tops.short_sleeve_shirts');
    });

    it('handles fully empty input without throwing', () => {
        expect(mapCategoryPath({})).toBe('tops.short_sleeve_shirts');
    });

    it('considers description and category fields, not just title', () => {
        expect(mapCategoryPath({ title: '', description: 'cozy hoodie', category: '' }))
            .toBe('tops.sweatshirts_hoodies');
        expect(mapCategoryPath({ category: 'denim' })).toBe('bottoms.denim');
    });
});

describe('getGrailedCSRFToken', () => {
    afterEach(() => jest.restoreAllMocks());

    it('extracts token from name-first meta tag', async () => {
        const html = '<html><head><meta name="csrf-token" content="tok-123" /></head></html>';
        global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html }) as any;

        await expect(getGrailedCSRFToken('cookie')).resolves.toBe('tok-123');
    });

    it('extracts token from content-first meta tag ordering', async () => {
        const html = '<meta content="tok-456" name="csrf-token">';
        global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html }) as any;

        await expect(getGrailedCSRFToken('cookie')).resolves.toBe('tok-456');
    });

    it('throws when the sell page request fails', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' }) as any;

        await expect(getGrailedCSRFToken('cookie')).rejects.toThrow(/503/);
    });

    it('throws when no token present (expired session)', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html></html>' }) as any;

        await expect(getGrailedCSRFToken('cookie')).rejects.toThrow(/CSRF token not found/);
    });
});

describe('getGrailedReturnAddressId', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns first address id from a bare array response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 7 }, { id: 8 }] }) as any;
        await expect(getGrailedReturnAddressId('99', 'c', 't')).resolves.toBe(7);
    });

    it('returns first address id from a { data } wrapped response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 42 }] }) }) as any;
        await expect(getGrailedReturnAddressId('99', 'c', 't')).resolves.toBe(42);
    });

    it('returns null when there are no addresses', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any;
        await expect(getGrailedReturnAddressId('99', 'c', 't')).resolves.toBeNull();
    });

    it('returns null on a non-ok response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;
        await expect(getGrailedReturnAddressId('99', 'c', 't')).resolves.toBeNull();
    });
});

describe('searchGrailedDesigner', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns null for an empty brand name without calling the API', async () => {
        const fetchMock = jest.fn();
        global.fetch = fetchMock as any;
        await expect(searchGrailedDesigner('', 'c', 't')).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('prefers an exact (case-insensitive) name match', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ name: 'Bapexclusive' }, { name: 'BAPE' }],
        }) as any;

        const result = await searchGrailedDesigner('bape', 'c', 't');
        expect(result?.name).toBe('BAPE');
    });

    it('falls back to the first result when there is no exact match', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ name: 'Stussy Deluxe' }, { name: 'Stussy Tribe' }],
        }) as any;

        const result = await searchGrailedDesigner('stussy', 'c', 't');
        expect(result?.name).toBe('Stussy Deluxe');
    });

    it('tries the second endpoint when the first yields no results', async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({ ok: true, json: async () => [] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ name: 'Nike' }] }) });
        global.fetch = fetchMock as any;

        const result = await searchGrailedDesigner('nike', 'c', 't');
        expect(result?.name).toBe('Nike');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns null and swallows network errors', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
        await expect(searchGrailedDesigner('nike', 'c', 't')).resolves.toBeNull();
    });
});
