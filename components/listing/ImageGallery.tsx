"use client";

import Image from "next/image";
import { useState } from "react";

interface ImageGalleryProps {
  images: string[];
  title: string;
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="aspect-square relative overflow-hidden border border-border bg-secondary/40">
        <div
          className="flex items-center justify-center w-full h-full uppercase tracking-[0.24em] text-[10px] text-muted-foreground"
          style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        >
          No image on file
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image — slim border, parchment frame, photo index in corner */}
      <div className="relative aspect-square overflow-hidden border border-border bg-secondary/30">
        <Image
          src={images[selectedIndex]}
          alt={title}
          fill
          className="object-cover transition-opacity duration-200"
          key={selectedIndex}
          sizes="(min-width: 1024px) 640px, 100vw"
        />
        {/* Photo counter overlay */}
        <div
          className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-sm border border-border px-2 py-1 text-[9px] uppercase tracking-[0.22em] text-foreground"
          style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        >
          Plate {String(selectedIndex + 1).padStart(2, "0")} ⁄ {String(images.length).padStart(2, "0")}
        </div>
      </div>

      {/* Thumbnails — flat parchment swatches, selected gets forest-green outline */}
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              aria-label={`View photo ${i + 1}`}
              className={`relative aspect-square overflow-hidden border bg-secondary/40 transition-all duration-150 ${
                i === selectedIndex
                  ? "border-[#2D6A4F] shadow-[0_0_0_2px_rgba(45,106,79,0.18)]"
                  : "border-border opacity-75 hover:opacity-100 hover:border-foreground/40"
              }`}
            >
              <Image
                src={img}
                alt={`${title} — photo ${i + 1}`}
                fill
                className="object-cover"
                sizes="120px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
