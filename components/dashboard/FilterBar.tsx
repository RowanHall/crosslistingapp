import Link from "next/link";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  currentFilter?: string;
}

export function FilterBar({ currentFilter = "all" }: FilterBarProps) {
  const filters = [
    { label: "ALL", value: "all" },
    { label: "DRAFTS", value: "drafts" },
    { label: "LISTED", value: "listed" },
    { label: "SOLD", value: "sold" },
  ];

  return (
    <div className="flex items-center gap-4 py-6 text-sm font-medium tracking-wide border-b border-border mb-6">
      {filters.map((filter) => (
        <Link
          key={filter.value}
          href={`/inventory?filter=${filter.value}`}
          className={cn(
            "hover:text-foreground transition-colors uppercase",
            currentFilter === filter.value ? "text-foreground underline underline-offset-4 decoration-[#2D6A4F] decoration-1" : "text-muted-foreground"
          )}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  );
}
