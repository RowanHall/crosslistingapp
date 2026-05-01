"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { InventoryCard, InventoryItem } from "./InventoryCard";
import { useDepopCrosslist } from "@/hooks/useDepopCrosslist";

const PLATFORMS = {
  depop: { label: "Depop", color: "#FF2300" },
  grailed: { label: "Grailed", color: "#161616" },
  facebook: { label: "Facebook", color: "#1877F2" },
} as const;

type Platform = keyof typeof PLATFORMS;

// ─── Bulk Action Bar ────────────────────────────────────────────────────────

interface BulkActionBarProps {
  selectedIds: Set<string>;
  rawListings: any[];
  onClear: () => void;
}

function BulkActionBar({ selectedIds, rawListings, onClear }: BulkActionBarProps) {
  const depop = useDepopCrosslist();
  const [grailedPosting, setGrailedPosting] = useState(false);
  const [grailedProgress, setGrailedProgress] = useState<string | null>(null);
  const [facebookPosting, setFacebookPosting] = useState(false);
  const [facebookProgress, setFacebookProgress] = useState<string | null>(null);

  const selected = rawListings.filter((l) => selectedIds.has(l.id));
  const count = selected.length;

  const handleDepop = () => {
    const toPost = selected.filter(
      (l) => l.source !== "depop" && !l.platforms_status?.depop
    );
    if (toPost.length === 0) {
      alert("All selected listings are already from Depop or already crosslisted.");
      return;
    }
    if (!confirm(`Post ${toPost.length} listing(s) to Depop?`)) return;
    depop.startCrosslist(
      toPost.map((l) => ({
        title: l.title,
        description: l.description,
        price: l.price,
        images: l.images || [],
        brand: l.brand,
        condition: l.condition,
        size: l.size,
      }))
    );
  };

  const handleGrailed = async () => {
    const toPost = selected.filter(
      (l) => l.platforms_status?.grailed !== "listed" && !l.grailed_listing_url
    );
    if (toPost.length === 0) {
      alert("All selected listings are already on Grailed.");
      return;
    }
    if (!confirm(`Post ${toPost.length} listing(s) to Grailed?`)) return;
    setGrailedPosting(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < toPost.length; i++) {
      setGrailedProgress(`${i + 1}/${toPost.length}: ${toPost[i].title}`);
      try {
        const res = await fetch("/api/crosslist/grailed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: toPost[i].id }),
        });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setGrailedPosting(false);
    setGrailedProgress(null);
    alert(`Done! ${ok} posted, ${fail} failed.`);
  };

  const handleFacebook = async () => {
    const toPost = selected.filter(
      (l) => l.platforms_status?.facebook !== "listed" && !l.facebook_listing_url
    );
    if (toPost.length === 0) {
      alert("All selected listings are already on Facebook Marketplace.");
      return;
    }
    if (!confirm(`Post ${toPost.length} listing(s) to Facebook Marketplace?`)) return;
    setFacebookPosting(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < toPost.length; i++) {
      setFacebookProgress(`${i + 1}/${toPost.length}: ${toPost[i].title}`);
      try {
        const res = await fetch("/api/crosslist/facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: toPost[i].id }),
        });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setFacebookPosting(false);
    setFacebookProgress(null);
    alert(`Done! ${ok} posted, ${fail} failed.`);
  };

  const progressText = depop.progress?.message || grailedProgress || facebookProgress;
  const isAnyActive = depop.isCrosslisting || grailedPosting || facebookPosting;

  function CrosslistButton({
    platform,
    isActive,
    onClick,
  }: {
    platform: Platform;
    isActive: boolean;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isActive || isAnyActive}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: PLATFORMS[platform].color }}
        />
        {isActive ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Posting…</>
        ) : (
          PLATFORMS[platform].label
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-sm animate-in slide-in-from-bottom-2 duration-150">
      <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        {/* Selection count + clear */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm uppercase tracking-tight whitespace-nowrap" style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}>
            {count} {count === 1 ? "item" : "items"} selected
          </span>
          <button
            onClick={onClear}
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-black transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Crosslist buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Crosslist to:
          </span>
          <CrosslistButton platform="depop" isActive={depop.isCrosslisting} onClick={handleDepop} />
          <CrosslistButton platform="grailed" isActive={grailedPosting} onClick={handleGrailed} />
          <CrosslistButton platform="facebook" isActive={facebookPosting} onClick={handleFacebook} />
        </div>

        {/* Progress text */}
        {progressText && (
          <p className="text-[10px] text-muted-foreground ml-auto truncate max-w-xs hidden md:block">
            {progressText}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Inventory Grid ──────────────────────────────────────────────────────────

interface InventoryGridProps {
  items: InventoryItem[];
  rawListings: any[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function InventoryGrid({ items, rawListings, selectedIds, onToggle, onSelectAll, onClear }: InventoryGridProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <>
      {/* Selection controls */}
      <div className="flex items-center gap-3 mb-4 h-5">
        {selectedIds.size > 0 ? (
          <>
            <span className="text-xs font-bold uppercase tracking-tight">
              {selectedIds.size} selected
            </span>
            {!allSelected && (
              <button
                onClick={onSelectAll}
                className="text-xs font-bold uppercase tracking-wider underline underline-offset-2 hover:no-underline"
              >
                Select all {items.length}
              </button>
            )}
            <button
              onClick={onClear}
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-black transition-colors"
            >
              Clear
            </button>
          </>
        ) : (
          <button
            onClick={onSelectAll}
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-black transition-colors"
          >
            Select all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
        {items.map((item) => (
          <InventoryCard
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>

      {/* Extra bottom padding so last row isn't hidden behind bulk bar */}
      {selectedIds.size > 0 && <div className="h-20" />}

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          rawListings={rawListings}
          onClear={onClear}
        />
      )}
    </>
  );
}
