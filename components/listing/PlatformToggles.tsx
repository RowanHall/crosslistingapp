"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useListingStore } from "@/store/useListingStore";

const PLATFORMS = [
  { id: "grailed", label: "GRAILED" },
  { id: "ebay", label: "EBAY" },
  { id: "poshmark", label: "POSHMARK" },
  { id: "depop", label: "DEPOP" },
];

export function PlatformToggles() {
  const { platforms, togglePlatform } = useListingStore();

  return (
    <div className="space-y-4 border-t border-border pt-6 mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Cross-Post Targets</h3>
      <div className="grid grid-cols-1 gap-3">
        {PLATFORMS.map((platform) => {
          const isSelected = platforms.includes(platform.id);
          return (
            <div
              key={platform.id}
              className={cn(
                "flex items-center justify-between p-3 border transition-colors",
                isSelected ? "border-black bg-secondary/50" : "border-border"
              )}
            >
              <div className="flex items-center space-x-3">
                <Checkbox 
                    id={platform.id} 
                    checked={isSelected}
                    onCheckedChange={() => togglePlatform(platform.id)}
                    className="rounded-none border-muted-foreground data-[state=checked]:bg-black data-[state=checked]:border-black"
                />
                <Label htmlFor={platform.id} className="text-sm font-medium uppercase tracking-wide cursor-pointer">
                  {platform.label}
                </Label>
              </div>
              {isSelected && (
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
                  Ready to Sync
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
