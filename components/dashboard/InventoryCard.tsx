import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";

export interface InventoryItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  status: "draft" | "listed" | "sold";
  platforms: string[];
}

interface InventoryCardProps {
  item: InventoryItem;
  isSelected?: boolean;
  onToggle?: () => void;
}

export function InventoryCard({ item, isSelected = false, onToggle }: InventoryCardProps) {
  return (
    <Link href={`/listing/${item.id}`} className="block">
      <Card className={`group rounded-none overflow-hidden transition-colors duration-200 cursor-pointer bg-card h-full ${isSelected ? "border-2 border-black" : "border border-border hover:border-black"}`}>
        <div className="aspect-[3/4] relative bg-secondary w-full overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">
              No Image
            </div>
          )}

          {/* Selected tint */}
          {isSelected && (
            <div className="absolute inset-0 bg-black/5 pointer-events-none" />
          )}

          {/* Platform badges — top-left */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {item.platforms.map((p) => (
              <Badge
                key={p}
                variant="secondary"
                className="rounded-none text-[10px] uppercase tracking-wider bg-white/90 backdrop-blur-sm border border-black/10"
              >
                {p}
              </Badge>
            ))}
          </div>

          {/* Checkbox — top-right */}
          {onToggle && (
            <div
              className="absolute top-2 right-2 z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }}
            >
              <div
                className={`w-5 h-5 border-2 border-black flex items-center justify-center transition-colors ${
                  isSelected ? "bg-black" : "bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100"
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </div>
            </div>
          )}
        </div>

        <CardContent className="p-3 space-y-1">
          <h3 className="font-bold text-sm tracking-tight uppercase truncate">{item.title}</h3>
          <p className="text-sm text-muted-foreground font-mono">
            {item.currency === "USD" ? "$" : ""}
            {item.price.toFixed(2)} {item.currency}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
