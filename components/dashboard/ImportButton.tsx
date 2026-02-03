"use client";
import { useEffect, useState } from 'react';

export default function ImportButton() {
  const [loading, setLoading] = useState(false);

  // 1. Listen for the Extension's Reply
  useEffect(() => {
    const handleResponse = (event: MessageEvent) => {
      // Security Check: Ensure message is from our extension logic
      if (event.data?.action === 'SYNC_COMPLETE') {
        console.log("React: 🟢 Received Response!", event.data.payload);
        
        const result = event.data.payload;
        setLoading(false); // Stop the spinner

        if (result?.success) {
           alert(`Success! Imported ${result.count || 0} items.`);
        } else {
           alert("Import Failed: " + (result?.error || "Unknown Error"));
        }
      }
    };

    window.addEventListener('message', handleResponse);
    return () => window.removeEventListener('message', handleResponse);
  }, []);

  const handleImportClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Extra safety against form submits
    
    // 2. Start Loading
    setLoading(true);
    console.log("React: Button Clicked. Sending message...");

    // 3. Safety Valve: Force stop after 5 seconds if no response
    setTimeout(() => {
        setLoading((current) => {
            if (current) {
                console.error("React: 🔴 Timeout - Extension did not reply.");
                alert("Error: Extension not responding. Please reload the page.");
                return false;
            }
            return current;
        });
    }, 5000);

    // 4. Send the Command
    try {
        window.postMessage({ action: 'SYNC_DEPOP' }, '*');
    } catch (err) {
        console.error("React: Failed to send", err);
        setLoading(false);
    }
  };

  // 5. The Render (With your Custom Styling + type="button")
  return (
    <button 
      type="button" // <--- CRITICAL FIX
      onClick={handleImportClick}
      disabled={loading}
      data-slot="button"
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2 has-[>svg]:px-3 font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[4px] disabled:translate-y-[4px]"
    >
      {loading ? "Syncing..." : "Sync from Depop"}
    </button>
  );
}