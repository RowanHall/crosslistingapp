import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportButton from '../ImportButton';
import '@testing-library/jest-dom';

describe('ImportButton', () => {
  beforeEach(() => {
    // Mock postMessage
    jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    // Clear mocks
    jest.clearAllMocks();
  });

  it('renders button correctly', () => {
    render(<ImportButton />);
    expect(screen.getByText('Import from Depop')).toBeInTheDocument();
  });

  it('sends postMessage on click', () => {
    render(<ImportButton />);
    fireEvent.click(screen.getByText('Import from Depop'));
    
    expect(window.parent.postMessage).toHaveBeenCalledWith(
        { action: 'SYNC_DEPOP' },
        '*'
    );
    expect(screen.getByText('Importing...')).toBeInTheDocument();
  });

  it('handles success response', () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ImportButton />);
    
    // Simulate click to set loading state
    fireEvent.click(screen.getByText('Import from Depop'));
    
    // Simulate response message
    const messageEvent = new MessageEvent('message', {
      data: {
        action: 'SYNC_COMPLETE',
        payload: { success: true, count: 5 }
      }
    });
    
    fireEvent(window, messageEvent);
    
    expect(screen.getByText('Import from Depop')).toBeInTheDocument(); // Loading stopped
    expect(window.alert).toHaveBeenCalledWith('Success! Imported 5 items.');
  });

  it('handles failure response', () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ImportButton />);
    
    fireEvent.click(screen.getByText('Import from Depop'));
    
    const messageEvent = new MessageEvent('message', {
      data: {
        action: 'SYNC_COMPLETE',
        payload: { success: false, error: 'Some error' }
      }
    });
    
    fireEvent(window, messageEvent);
    
    expect(window.alert).toHaveBeenCalledWith('Import Failed: Some error');
  });
});
