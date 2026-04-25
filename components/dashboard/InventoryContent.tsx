"use client";

import { useState } from "react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { InventoryGrid } from "@/components/dashboard/InventoryGrid";
import { PlatformActionsBar } from "@/components/dashboard/PlatformActionsBar";
import { InventoryItem } from "@/components/dashboard/InventoryCard";

interface InventoryContentProps {
  items: InventoryItem[];
  rawListings: any[];
  filter: string;
}

export function InventoryContent({ items, rawListings, filter }: InventoryContentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle    = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const clear     = () => setSelectedIds(new Set());

  return (
    <>
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">My Inventory</h1>
          <p className="text-muted-foreground text-sm tracking-wide">
            MANAGE YOUR LISTINGS ACROSS ALL PLATFORMS
          </p>
        </div>

        <div className="flex items-start gap-5 relative">
          <PlatformActionsBar />

          <div className="w-px self-stretch bg-border mt-5" />

          {/* Single crosslist shortcut — selects all to reveal bulk bar */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Crosslist
            </p>
            <button
              type="button"
              onClick={selectedIds.size === items.length ? clear : selectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-black bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            >
              {selectedIds.size > 0 && selectedIds.size === items.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        </div>
      </div>

      <FilterBar currentFilter={filter} />

      <InventoryGrid
        items={items}
        rawListings={rawListings}
        selectedIds={selectedIds}
        onToggle={toggle}
        onSelectAll={selectAll}
        onClear={clear}
      />
    </>
  );
}
