// Mock global chrome object
global.chrome = {
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn()
    },
    webRequest: {
        onBeforeSendHeaders: { addListener: jest.fn() },
        onHeadersReceived: { addListener: jest.fn() }
    },
    runtime: {
        onMessage: { addListener: jest.fn() }
    }
};

const { handleDepopSync, setLatestUserId } = require('../background');

describe('Background Script - handleDepopSync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset console logs to avoid clutter
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('fails if no active Depop tab found', async () => {
        chrome.tabs.query.mockResolvedValue([]);
        const sendResponse = jest.fn();

        await handleDepopSync(sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: "Please open a Depop tab to sync."
        });
    });

    it('fails if User ID not captured', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
        // Ensure User ID is null
        setLatestUserId(null);
        const sendResponse = jest.fn();

        await handleDepopSync(sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: "User ID not yet captured. Please browse Depop first."
        });
    });

    it('delegates to tab if setup is correct', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
        setLatestUserId('12345');
        const sendResponse = jest.fn();
        chrome.tabs.sendMessage.mockResolvedValue({ success: true, count: 10 });

        await handleDepopSync(sendResponse);

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
            type: 'EXECUTE_PAGE_FETCH',
            userId: '12345'
        });
        expect(sendResponse).toHaveBeenCalledWith({ success: true, count: 10 });
    });
});
