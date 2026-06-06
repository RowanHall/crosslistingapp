global.chrome = {
    runtime: {
        onMessage: { addListener: jest.fn() }
    }
};

const { performInPageFetch } = require('../extension/scripts/bridge');

global.fetch = jest.fn();

describe('Bridge Script - performInPageFetch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('fetches products successfully', async () => {
        const mockProducts = [{ id: 1 }, { id: 2 }];
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ products: mockProducts })
        });

        const result = await performInPageFetch('user123');

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('https://webapi.depop.com/api/v3/shop/user123/products/'),
            expect.anything()
        );
        expect(result).toEqual({ success: true, products: mockProducts, count: mockProducts.length });
    });

    it('handles fetch errors', async () => {
        fetch.mockResolvedValue({
            ok: false,
            status: 500
        });

        const result = await performInPageFetch('user123');

        expect(result).toEqual({ success: false, error: 'Depop API Error: 500' });
    });

    it('handles network errors', async () => {
        fetch.mockRejectedValue(new Error('Network error'));

        const result = await performInPageFetch('user123');

        expect(result).toEqual({ success: false, error: 'Network error' });
    });
});
