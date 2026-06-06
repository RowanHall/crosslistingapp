
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportButton from '../ImportButton';

// ----------------------------------------------------------------------------
// 1. SETUP MOCK INFRASTRUCTURE
// ----------------------------------------------------------------------------

// Store listeners captured from the modules
let backgroundListener: any = null;
let bridgeListener: any = null;

// Mock Chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    lastError: null as any,
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn(),
  },
  webRequest: {
    onBeforeSendHeaders: { addListener: jest.fn() },
    onHeadersReceived: { addListener: jest.fn() },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
};

// Apply global mock BEFORE requiring modules
(global as any).chrome = mockChrome;

// ----------------------------------------------------------------------------
// 2. LOAD MODULES (ISOLATED CAPTURE)
// ----------------------------------------------------------------------------
// We need to capture the SPECIFIC listener for each module.
// Since they both call chrome.runtime.onMessage.addListener, we intercept it.

// Load Background Script
mockChrome.runtime.onMessage.addListener.mockImplementation((fn: any) => {
  backgroundListener = fn;
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const backgroundScript = require('../../../extension/background');

// Load Bridge Script
mockChrome.runtime.onMessage.addListener.mockImplementation((fn: any) => {
  bridgeListener = fn;
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../../../extension/scripts/bridge');

// ----------------------------------------------------------------------------
// 3. CONFIGURE THE "BUS"
// ----------------------------------------------------------------------------

// Mock tabs.query to return a valid Depop tab
mockChrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://depop.com/myshop' }]);

// Background calls chrome.tabs.sendMessage(tabId, message, callback). Route the
// message through the bridge listener and pass the response back via callback.
mockChrome.tabs.sendMessage.mockImplementation((tabId: number, message: any, callback: (res: any) => void) => {
  if (!bridgeListener) {
    throw new Error("Bridge listener not attached!");
  }
  bridgeListener(message, { tab: { id: tabId } }, (response: any) => {
    if (typeof callback === 'function') callback(response);
  });
});

// Mock Global Fetch (Network Layer)
global.fetch = jest.fn();

// Mock Window methods
const originalPostMessage = window.parent.postMessage;
window.alert = jest.fn();

// ----------------------------------------------------------------------------
// 4. THE TEST SUITE
// ----------------------------------------------------------------------------

describe('Import Flow Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();

    // Background reads the Depop user ID from chrome.storage.local now
    mockChrome.storage.local.get.mockResolvedValue({ depop_user_id: '12345' });
    mockChrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://depop.com/myshop' }]);
    mockChrome.runtime.lastError = null;
  });

  test('Full Happy Path: Button Click -> Background -> Bridge -> Fetch -> UI Update', async () => {
    // 1. Setup Network Mock
    const mockProducts = [{ id: 1, slug: 'cool-shirt' }, { id: 2, slug: 'nice-pants' }];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ products: mockProducts }),
    });

    // 2. Render Component
    render(<ImportButton />);
    const button = screen.getByText('Sync from Depop');

    // 3. Spy on window.parent.postMessage to act as the "Content Script Relay"
    // The component calls window.parent.postMessage({ action: 'SYNC_DEPOP' }, '*')
    const messageSpy = jest.spyOn(window.parent, 'postMessage').mockImplementation((message: any) => {
        // console.log('[RELAY] Intercepted PostMessage:', message);

        if (message.action === 'SYNC_DEPOP') {
            // RELAY LOGIC: Transform and forward to Background
            const bgMessage = { action: 'SYNC_DEPOP' };
            
            // Call Background Listener
            // signature: (request, sender, sendResponse)
            const sendResponse = (response: any) => {
                // console.log('[RELAY] Received Response from Background:', response);
                
                // Forward back to Component via window.postMessage
                // The component listens for { action: 'SYNC_COMPLETE', payload: ... }
                // We need to fire a MessageEvent on the window
                const event = new MessageEvent('message', {
                    data: {
                        action: 'SYNC_COMPLETE',
                        payload: response
                    }
                });
                window.dispatchEvent(event);
            };

            backgroundListener(bgMessage, {}, sendResponse);
        }
    });

    // 4. Simulate User Interaction
    fireEvent.click(button);

    // 5. Verification Steps
    
    // A. Verify Button text changes to loading
    expect(screen.getByText('Syncing...')).toBeInTheDocument();

    // B. Verify Fetch was called (Bridge Logic executed)
    // Wait for the async chain to complete
    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(fetchUrl).toContain('webapi.depop.com/api/v3/shop/12345/products');

    // C. Verify Success Alert (Component Logic executed)
    await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Success! Imported 2 items'));
    });

    // Clean up spy
    messageSpy.mockRestore();
  });

  test('Sad Path: Network Error -> Error Propagates -> UI Updates', async () => {
    // 1. Setup Network Mock to Fail
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network Disconnected"));

    // 2. Render Component
    render(<ImportButton />);
    const button = screen.getByText('Sync from Depop');

    // 3. Spy on window.parent.postMessage (Relay Logic)
    const messageSpy = jest.spyOn(window.parent, 'postMessage').mockImplementation((message: any) => {
        if (message.action === 'SYNC_DEPOP') {
            const bgMessage = { action: 'SYNC_DEPOP' };
            
            const sendResponse = (response: any) => {
                const event = new MessageEvent('message', {
                    data: {
                        action: 'SYNC_COMPLETE',
                        payload: response
                    }
                });
                window.dispatchEvent(event);
            };

            backgroundListener(bgMessage, {}, sendResponse);
        }
    });

    // 4. Simulate User Interaction
    fireEvent.click(button);

    // 5. Verification Steps
    
    // A. Verify Loading State appears initially
    expect(screen.getByText('Syncing...')).toBeInTheDocument();

    // B. Verify Fetch was attempted
    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // C. Verify Error Alert
    await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Import Failed: Network Disconnected'));
    });

    // D. Verify Button Resets (Loading state removed)
    await waitFor(() => {
        expect(screen.getByText('Sync from Depop')).toBeInTheDocument();
        expect(screen.queryByText('Syncing...')).not.toBeInTheDocument();
    });

    // Clean up spy
    messageSpy.mockRestore();
  });
});
