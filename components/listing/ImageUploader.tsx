"use client";

import { Upload, X } from "lucide-react";
import { useListingStore } from "@/store/useListingStore";
import { useRef } from "react";
import Image from "next/image";

export function ImageUploader() {
  const { images, imageUrls, addImage, removeImage } = useListingStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addImage(e.target.files[0]);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*"
      />

      {/* Hero Image Slot (First Image) */}
      <div 
        onClick={imageUrls.length === 0 ? triggerUpload : undefined}
        className="col-span-2 aspect-[3/4] border border-dashed border-border flex flex-col items-center justify-center bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group relative overflow-hidden"
      >
        {imageUrls.length > 0 ? (
          <>
            <img src={imageUrls[0]} alt="Hero" className="w-full h-full object-cover" />
            <button 
              onClick={(e) => { e.stopPropagation(); removeImage(0); }}
              className="absolute top-2 right-2 p-1 bg-black text-white rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground group-hover:text-foreground transition-colors mb-2" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground">Cover Image</span>
          </>
        )}
      </div>

      {/* Subsequent Images Grid */}
      {[1, 2, 3, 4].map((i) => {
        const hasImage = i < imageUrls.length;
        const url = hasImage ? imageUrls[i] : null;

        return (
          <div 
            key={i} 
            onClick={!hasImage ? triggerUpload : undefined}
            className="aspect-[3/4] border border-dashed border-border flex items-center justify-center bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group relative overflow-hidden"
          >
            {hasImage ? (
               <>
                <img src={url!} alt={`Image ${i}`} className="w-full h-full object-cover" />
                <button 
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute top-2 right-2 p-1 bg-black text-white rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">+</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
