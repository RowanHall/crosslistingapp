import { useListingStore } from '@/store/useListingStore';

// jsdom does not implement object URLs — stub them so addImage/removeImage work.
beforeAll(() => {
    let counter = 0;
    (URL as any).createObjectURL = jest.fn(() => `blob:mock/${counter++}`);
    (URL as any).revokeObjectURL = jest.fn();
});

beforeEach(() => {
    useListingStore.getState().reset();
    jest.clearAllMocks();
});

const get = () => useListingStore.getState();
const makeFile = (name: string) => new File(['data'], name, { type: 'image/png' });

describe('useListingStore', () => {
    it('has empty initial state', () => {
        const s = get();
        expect(s.title).toBe('');
        expect(s.price).toBe('');
        expect(s.platforms).toEqual([]);
        expect(s.images).toEqual([]);
        expect(s.imageUrls).toEqual([]);
    });

    it('updates scalar fields via setters', () => {
        get().setTitle('Jacket');
        get().setPrice('99');
        get().setSku('SKU-1');
        get().setDescription('A jacket');

        const s = get();
        expect(s.title).toBe('Jacket');
        expect(s.price).toBe('99');
        expect(s.sku).toBe('SKU-1');
        expect(s.description).toBe('A jacket');
    });

    it('togglePlatform adds then removes a platform', () => {
        get().togglePlatform('grailed');
        expect(get().platforms).toEqual(['grailed']);

        get().togglePlatform('ebay');
        expect(get().platforms).toEqual(['grailed', 'ebay']);

        get().togglePlatform('grailed');
        expect(get().platforms).toEqual(['ebay']);
    });

    it('addImage stores the file and a generated preview URL', () => {
        const file = makeFile('a.png');
        get().addImage(file);

        const s = get();
        expect(s.images).toEqual([file]);
        expect(s.imageUrls).toHaveLength(1);
        expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });

    it('removeImage revokes the URL and drops the matching index', () => {
        const a = makeFile('a.png');
        const b = makeFile('b.png');
        get().addImage(a);
        get().addImage(b);

        const urlToRevoke = get().imageUrls[0];
        get().removeImage(0);

        const s = get();
        expect(s.images).toEqual([b]);
        expect(s.imageUrls).toHaveLength(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(urlToRevoke);
    });

    it('reset clears all fields back to empty', () => {
        get().setTitle('x');
        get().togglePlatform('grailed');
        get().addImage(makeFile('a.png'));

        get().reset();

        const s = get();
        expect(s.title).toBe('');
        expect(s.platforms).toEqual([]);
        expect(s.images).toEqual([]);
        expect(s.imageUrls).toEqual([]);
    });
});
