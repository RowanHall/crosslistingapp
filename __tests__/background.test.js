// Mock global chrome object
global.chrome = {
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
        create: jest.fn(),
    },
    webRequest: {
        onBeforeSendHeaders: { addListener: jest.fn() },
        onHeadersReceived: { addListener: jest.fn() }
    },
    runtime: {
        onMessage: { addListener: jest.fn() },
        lastError: null,
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
        }
    }
};

const { handleDepopSync } = require('../extension/background');

describe('Background Script - handleDepopSync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chrome.runtime.lastError = null;
        // Reset console logs to avoid clutter
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('fails if no Depop user ID has been captured', async () => {
        chrome.storage.local.get.mockResolvedValue({});
        const sendResponse = jest.fn();

        await handleDepopSync(sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: "User ID missing. Please refresh Depop."
        });
    });

    it('fails if no active Depop tab found', async () => {
        chrome.storage.local.get.mockResolvedValue({ depop_user_id: '12345' });
        chrome.tabs.query.mockResolvedValue([]);
        const sendResponse = jest.fn();

        await handleDepopSync(sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: "Please open a Depop tab."
        });
    });

    it('delegates to tab if setup is correct', async () => {
        chrome.storage.local.get.mockResolvedValue({ depop_user_id: '12345' });
        chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
        chrome.tabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
            callback({ success: true, count: 10 });
        });
        const sendResponse = jest.fn();

        await handleDepopSync(sendResponse);

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            123,
            { type: 'EXECUTE_PAGE_FETCH', userId: '12345' },
            expect.any(Function)
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true, count: 10 });
    });
});
