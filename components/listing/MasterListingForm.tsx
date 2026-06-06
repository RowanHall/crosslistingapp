"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "./ImageUploader";
import { PlatformToggles } from "./PlatformToggles";
import { useListingStore } from "@/store/useListingStore";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createListing } from "@/app/listing/actions";
import { publishToEbay } from "@/actions/ebay";

import { useExtension } from "@/hooks/useExtension";

export function MasterListingForm() {
  const store = useListingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { sendMessageToExtension } = useExtension();

  // Listen for scraped data from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.action === 'SCRAPE_RESULT' && event.data.payload) {
        const data = event.data.payload;
        console.log("Scraped Data:", data);
        
        if (data.title) store.setTitle(data.title); // Note: Depop scraper might not return title, usually description
        if (data.description) store.setDescription(data.description);
        if (data.price) store.setPrice(data.price);
        // Images handling might need to be more complex (converting URLs to Files or handling explicitly in store)
        // For now, we'll just log images or if store supports URLs... 
        // store.images expects File objects usually, so we might need to fetch and blob them or just skip for now.
        // The user only asked to "populate the form state".
        
        // If the scraper uses description as title (common in Depop)
        if (!data.title && data.description) {
            // minimal heuristic
            store.setTitle(data.description.substring(0, 50) + "...");
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [store]);

  const handleImport = () => {
    sendMessageToExtension('EXECUTE_SCRAPER');
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setStatusMessage("Uploading images...");
    try {
      // Debug Auth
      const { data: { user } } = await supabase.auth.getUser();
      console.log("User:", user?.id);

      // 1. Upload Images
      const uploadedUrls: string[] = [];
      
      for (const file of store.images) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('listing-images')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setStatusMessage("Creating listing...");
      // 2. Create Listing via Server Action
      const { id: listingId } = await createListing({
        title: store.title,
        description: store.description,
        price: parseFloat(store.price) || 0,
        images: uploadedUrls,
        platforms: store.platforms,
      });

      // 3. Publish to eBay if selected
      if (store.platforms.includes('ebay')) {
          setStatusMessage("Publishing to eBay...");
          await publishToEbay(listingId);
      }

      // 4. Publish to Facebook if selected
      if (store.platforms.includes('facebook')) {
          setStatusMessage("Publishing to Facebook...");
          const res = await fetch('/api/crosslist/facebook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listingId }),
          });
          if (!res.ok) {
            const data = await res.json();
            console.error('Facebook crosslist error:', data.error);
          }
      }

      // Depop publishing is handled via the Chrome extension, not server-side

      setStatusMessage("Done!");
      // 4. Reset and Redirect
      store.reset();
      router.push('/inventory');
      
    } catch (error) {
      console.error('Error saving listing:', error);
      alert('Failed to save listing. Check console for details.');
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-3.5rem)]">
      {/* Left Side: Images */}
      <div className="lg:col-span-5 xl:col-span-4 h-full overflow-y-auto p-6 border-r border-border scrollbar-hide">
        <ImageUploader />
      </div>

      {/* Right Side: Data Entry */}
      <div className="lg:col-span-7 xl:col-span-8 h-full overflow-y-auto p-6 lg:p-12">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center justify-end gap-4">
             {statusMessage && (
                 <span className="text-xs font-mono uppercase tracking-widest animate-pulse">
                     {statusMessage}
                 </span>
             )}
             <Button 
                onClick={handleImport}
                variant="outline"
                className="rounded-none border-black hover:bg-black hover:text-white mr-2"
             >
                IMPORT FROM TAB
             </Button>
             <Button 
                onClick={handleSave} 
                disabled={isSubmitting}
                className="rounded-none bg-black text-white hover:invert border border-black min-w-[120px]"
             >
                {isSubmitting ? "PROCESSING..." : "SAVE LISTING"}
             </Button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs uppercase tracking-widest text-muted-foreground">Title</Label>
              <Input 
                id="title" 
                value={store.title}
                onChange={(e) => store.setTitle(e.target.value)}
                placeholder="VINTAGE HELMUT LANG BOMBER..." 
                className="rounded-none border-x-0 border-t-0 border-b border-border px-0 text-lg font-bold uppercase tracking-tight focus-visible:ring-0 focus-visible:border-black placeholder:text-muted-foreground/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                <Label htmlFor="price" className="text-xs uppercase tracking-widest text-muted-foreground">Price</Label>
                <Input 
                    id="price" 
                    type="number"
                    value={store.price}
                    onChange={(e) => store.setPrice(e.target.value)}
                    placeholder="0.00" 
                    className="rounded-none border-x-0 border-t-0 border-b border-border px-0 font-mono focus-visible:ring-0 focus-visible:border-black"
                />
                </div>
                <div className="space-y-2">
                <Label htmlFor="sku" className="text-xs uppercase tracking-widest text-muted-foreground">SKU</Label>
                <Input 
                    id="sku" 
                    value={store.sku}
                    onChange={(e) => store.setSku(e.target.value)}
                    placeholder="AUTO-GENERATED" 
                    className="rounded-none border-x-0 border-t-0 border-b border-border px-0 font-mono text-muted-foreground focus-visible:ring-0 focus-visible:border-black"
                    readOnly
                />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs uppercase tracking-widest text-muted-foreground">Description</Label>
              <Textarea 
                id="description" 
                value={store.description}
                onChange={(e) => store.setDescription(e.target.value)}
                placeholder="Add measurements, condition, and details..." 
                className="rounded-none border border-border min-h-[200px] resize-none focus-visible:ring-0 focus-visible:border-black p-4 font-sans"
              />
            </div>
          </div>

          <PlatformToggles />
        </div>
      </div>
    </div>
  );
}
