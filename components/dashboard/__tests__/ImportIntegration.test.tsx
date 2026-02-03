
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
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
  webRequest: {
    onBeforeSendHeaders: { addListener: jest.fn() },
    onHeadersReceived: { addListener: jest.fn() },
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

// Mock tabs.sendMessage to route to the BRIDGE listener
mockChrome.tabs.sendMessage.mockImplementation(async (tabId, message) => {
  // console.log(`[BUS] Background -> Bridge (Tab ${tabId}):`, message);
  
  if (!bridgeListener) {
    throw new Error("Bridge listener not attached!");
  }

  // Bridge listener signature: (request, sender, sendResponse) -> boolean
  // Bridge returns generic Promise or calls sendResponse. 
  // In bridge.js, it returns true and calls sendResponse async.
  // We need to promisify this for the Background script (which awaits tabs.sendMessage)
  
  return new Promise((resolve) => {
    const sendResponse = (response: any) => {
      resolve(response);
    };
    bridgeListener(message, { tab: { id: tabId } }, sendResponse);
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
    
    // Set required state in Background (User ID is needed for sync)
    // accessible via the exported helper from background.js
    if (backgroundScript.setLatestUserId) {
      backgroundScript.setLatestUserId('12345');
    } else {
      console.warn("setLatestUserId not found on background exports");
    }
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
    const button = screen.getByText('Import from Depop');

    // 3. Spy on window.parent.postMessage to act as the "Content Script Relay"
    // The component calls window.parent.postMessage({ action: 'SYNC_DEPOP' }, '*')
    const messageSpy = jest.spyOn(window.parent, 'postMessage').mockImplementation((message: any) => {
        // console.log('[RELAY] Intercepted PostMessage:', message);

        if (message.action === 'SYNC_DEPOP') {
            // RELAY LOGIC: Transform and forward to Background
            const bgMessage = { type: 'SYNC_DEPOP' };
            
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
    expect(screen.getByText('Importing...')).toBeInTheDocument();

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
    const button = screen.getByText('Import from Depop');

    // 3. Spy on window.parent.postMessage (Relay Logic)
    const messageSpy = jest.spyOn(window.parent, 'postMessage').mockImplementation((message: any) => {
        if (message.action === 'SYNC_DEPOP') {
            const bgMessage = { type: 'SYNC_DEPOP' };
            
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
    expect(screen.getByText('Importing...')).toBeInTheDocument();

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
        expect(screen.getByText('Import from Depop')).toBeInTheDocument();
        expect(screen.queryByText('Importing...')).not.toBeInTheDocument();
    });

    // Clean up spy
    messageSpy.mockRestore();
  });
});
