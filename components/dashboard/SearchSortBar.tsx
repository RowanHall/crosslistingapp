"use client";

import { Search, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

export type SortOption =
  | "newest"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "title-asc"
  | "title-desc";

const SORT_LABELS: Record<SortOption, string> = {
  "newest":     "Newest first",
  "oldest":     "Oldest first",
  "price-asc":  "Price: Low to High",
  "price-desc": "Price: High to Low",
  "title-asc":  "Title: A → Z",
  "title-desc": "Title: Z → A",
};

export const PLATFORM_OPTIONS = [
  { value: "depop",    label: "Depop",    icon: "/platforms/depop.png" },
  { value: "grailed",  label: "Grailed",  icon: "/platforms/grailed.png" },
  { value: "facebook", label: "Facebook", icon: "/platforms/facebook2.svg" },
  { value: "ebay",     label: "eBay",     icon: "/platforms/ebay.png" },
  { value: "shopify",  label: "Shopify",  icon: "/platforms/shopify.svg" },
] as const;

export type PlatformValue = (typeof PLATFORM_OPTIONS)[number]["value"];

export interface InventoryFilters {
  priceMin: string;
  priceMax: string;
  platforms: PlatformValue[];
  notCrosslisted: boolean;
}

export const EMPTY_FILTERS: InventoryFilters = {
  priceMin: "",
  priceMax: "",
  platforms: [],
  notCrosslisted: false,
};

export function filtersAreEmpty(f: InventoryFilters): boolean {
  return (
    f.priceMin === "" &&
    f.priceMax === "" &&
    f.platforms.length === 0 &&
    !f.notCrosslisted
  );
}

interface PlatformChipProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

function PlatformChip({ label, icon, active, onClick }: PlatformChipProps) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center h-9 min-w-9 px-2 border transition-colors ${
        active
          ? "border-[#2D6A4F] bg-[#2D6A4F] text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {iconFailed ? (
        <span className="px-1 text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
      ) : (
        <img
          src={icon}
          alt={label}
          onError={() => setIconFailed(true)}
          className="w-5 h-5 object-contain"
        />
      )}
    </button>
  );
}

function activeFilterCount(f: InventoryFilters): number {
  let n = 0;
  if (f.priceMin !== "") n++;
  if (f.priceMax !== "") n++;
  n += f.platforms.length;
  if (f.notCrosslisted) n++;
  return n;
}

interface SearchSortBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  filters: InventoryFilters;
  onFiltersChange: (f: InventoryFilters) => void;
  resultCount: number;
  totalCount: number;
}

export function SearchSortBar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  resultCount,
  totalCount,
}: SearchSortBarProps) {
  const isSearching = query.trim().length > 0;
  const activeCount = activeFilterCount(filters);
  const hasAnyFilter = activeCount > 0;
  const [showFilters, setShowFilters] = useState(hasAnyFilter);

  const togglePlatform = (p: PlatformValue) => {
    const next = filters.platforms.includes(p)
      ? filters.platforms.filter((x) => x !== p)
      : [...filters.platforms, p];
    onFiltersChange({ ...filters, platforms: next });
  };

  const clearAll = () => onFiltersChange(EMPTY_FILTERS);

  return (
    <div className="mb-6 flex flex-col gap-3">
      {/* Top row: search + sort + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            strokeWidth={2}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by title, brand, or platform…"
            className="w-full h-10 pl-10 pr-10 bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground rounded-none focus:outline-none focus:border-[#2D6A4F] transition-colors"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex gap-3">
          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`relative flex items-center gap-2 h-10 px-3 border text-xs font-bold uppercase tracking-wider transition-colors ${
              showFilters || hasAnyFilter
                ? "border-[#2D6A4F] bg-[#2D6A4F] text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            Filters
            {activeCount > 0 && (
              <span
                className={`min-w-5 h-5 px-1.5 flex items-center justify-center text-[10px] ${
                  showFilters || hasAnyFilter
                    ? "bg-primary-foreground text-[#2D6A4F]"
                    : "bg-[#2D6A4F] text-primary-foreground"
                }`}
              >
                {activeCount}
              </span>
            )}
          </button>

          {/* Sort dropdown */}
          <div className="relative flex-1 sm:w-64">
            <label htmlFor="inventory-sort" className="sr-only">
              Sort listings
            </label>
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground pointer-events-none"
              style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
            >
              Sort
            </span>
            <select
              id="inventory-sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="appearance-none w-full h-10 pl-14 pr-9 bg-background border border-border text-foreground text-sm rounded-none focus:outline-none focus:border-[#2D6A4F] transition-colors cursor-pointer"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <option key={opt} value={opt}>
                  {SORT_LABELS[opt]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              strokeWidth={2}
            />
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="border border-border bg-card p-4 flex flex-col gap-4">
          {/* Price range */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            <div className="flex-1">
              <p
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2"
                style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
              >
                Price Range
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono pointer-events-none">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Min"
                    value={filters.priceMin}
                    onChange={(e) =>
                      onFiltersChange({ ...filters, priceMin: e.target.value })
                    }
                    className="w-full h-10 pl-7 pr-3 bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground rounded-none focus:outline-none focus:border-[#2D6A4F] transition-colors font-mono"
                  />
                </div>
                <span className="text-muted-foreground text-xs uppercase tracking-widest">
                  to
                </span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono pointer-events-none">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Max"
                    value={filters.priceMax}
                    onChange={(e) =>
                      onFiltersChange({ ...filters, priceMax: e.target.value })
                    }
                    className="w-full h-10 pl-7 pr-3 bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground rounded-none focus:outline-none focus:border-[#2D6A4F] transition-colors font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Not crosslisted toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none sm:pb-2">
              <input
                type="checkbox"
                checked={filters.notCrosslisted}
                onChange={(e) =>
                  onFiltersChange({ ...filters, notCrosslisted: e.target.checked })
                }
                className="sr-only peer"
              />
              <span
                className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${
                  filters.notCrosslisted
                    ? "bg-[#2D6A4F] border-[#2D6A4F]"
                    : "border-foreground bg-background"
                }`}
              >
                {filters.notCrosslisted && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={4}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="square" />
                  </svg>
                )}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                Not yet crosslisted
              </span>
            </label>
          </div>

          {/* Platform chips */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2"
              style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
            >
              Listed On
            </p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => {
                const active = filters.platforms.includes(p.value);
                return (
                  <PlatformChip
                    key={p.value}
                    label={p.label}
                    icon={p.icon}
                    active={active}
                    onClick={() => togglePlatform(p.value)}
                  />
                );
              })}
            </div>
          </div>

          {/* Clear all */}
          {hasAnyFilter && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Result count line */}
      {(isSearching || hasAnyFilter) && (
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {resultCount} of {totalCount} {totalCount === 1 ? "listing" : "listings"}
          {isSearching && <> match “{query}”</>}
          {!isSearching && hasAnyFilter && <> after filters</>}
        </p>
      )}
    </div>
  );
}
