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
      <div className="aspect-square relative overflow-hidden rounded-lg border-2 border-black bg-neutral-100">
        <div className="flex items-center justify-center w-full h-full text-neutral-400">
          No Image
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main Image */}
      <div className="aspect-square relative overflow-hidden rounded-lg border-2 border-black bg-neutral-100">
        <Image
          src={images[selectedIndex]}
          alt={title}
          fill
          className="object-cover transition-opacity duration-200"
          key={selectedIndex}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={`aspect-square relative overflow-hidden rounded-lg border-2 bg-neutral-100 transition-all duration-150 ${
                i === selectedIndex
                  ? "border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] scale-[1.02]"
                  : "border-neutral-300 hover:border-black opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={img}
                alt={`${title} - Photo ${i + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
