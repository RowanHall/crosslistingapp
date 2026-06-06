"use client";

import { useMemo, useState } from "react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { InventoryGrid } from "@/components/dashboard/InventoryGrid";
import { PlatformActionsBar } from "@/components/dashboard/PlatformActionsBar";
import {
  SearchSortBar,
  SortOption,
  InventoryFilters,
  EMPTY_FILTERS,
  filtersAreEmpty,
} from "@/components/dashboard/SearchSortBar";
import { InventoryItem } from "@/components/dashboard/InventoryCard";

interface InventoryContentProps {
  items: InventoryItem[];
  rawListings: any[];
  filter: string;
}

export function InventoryContent({ items, rawListings, filter }: InventoryContentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);

  const rawById = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of rawListings) map.set(r.id, r);
    return map;
  }, [rawListings]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = filters.priceMin === "" ? null : Number(filters.priceMin);
    const max = filters.priceMax === "" ? null : Number(filters.priceMax);
    const platformFilter = filters.platforms;
    const empty = filtersAreEmpty(filters) && q === "";

    const filtered = empty
      ? items
      : items.filter((item) => {
          if (q) {
            const raw = rawById.get(item.id);
            const matches =
              item.title?.toLowerCase().includes(q) ||
              item.platforms.some((p) => p.toLowerCase().includes(q)) ||
              raw?.brand?.toLowerCase().includes(q) ||
              raw?.description?.toLowerCase().includes(q);
            if (!matches) return false;
          }

          if (min !== null && !Number.isNaN(min) && item.price < min) return false;
          if (max !== null && !Number.isNaN(max) && item.price > max) return false;

          if (platformFilter.length > 0) {
            const owned = new Set(item.platforms.map((p) => p.toLowerCase()));
            if (!platformFilter.every((p) => owned.has(p))) return false;
          }

          if (filters.notCrosslisted && item.platforms.length > 0) return false;

          return true;
        });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "newest":
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "price-asc":
          return (a.price ?? 0) - (b.price ?? 0);
        case "price-desc":
          return (b.price ?? 0) - (a.price ?? 0);
        case "title-asc":
          return (a.title || "").localeCompare(b.title || "");
        case "title-desc":
          return (b.title || "").localeCompare(a.title || "");
        default:
          return 0;
      }
    });
    return sorted;
  }, [items, query, sort, filters, rawById]);

  const isNarrowed = query.trim().length > 0 || !filtersAreEmpty(filters);

  const toggle    = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAll = () => setSelectedIds(new Set(visibleItems.map((i) => i.id)));
  const clear     = () => setSelectedIds(new Set());

  const resetSearchAndFilters = () => {
    setQuery("");
    setFilters(EMPTY_FILTERS);
  };

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
              onClick={selectedIds.size === visibleItems.length ? clear : selectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-border bg-background text-foreground hover:bg-muted transition-colors"
            >
              {selectedIds.size > 0 && selectedIds.size === visibleItems.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        </div>
      </div>

      <FilterBar currentFilter={filter} />

      <SearchSortBar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={visibleItems.length}
        totalCount={items.length}
      />

      {visibleItems.length === 0 && isNarrowed ? (
        <div className="border border-border bg-card px-6 py-16 text-center">
          <p
            className="text-lg uppercase tracking-tighter mb-2"
            style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
          >
            No matching listings
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Try a different keyword, widen your price range, or remove a filter.
          </p>
          <button
            type="button"
            onClick={resetSearchAndFilters}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 border border-border bg-background hover:bg-muted transition-colors"
          >
            Reset
          </button>
        </div>
      ) : (
        <InventoryGrid
          items={visibleItems}
          rawListings={rawListings}
          selectedIds={selectedIds}
          onToggle={toggle}
          onSelectAll={selectAll}
          onClear={clear}
        />
      )}
    </>
  );
}
