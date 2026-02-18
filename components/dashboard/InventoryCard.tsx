import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
}



export function InventoryCard({ item }: InventoryCardProps) {
  return (
    <Link href={`/listing/${item.id}`} className="block">
    <Card className="group border border-border rounded-none overflow-hidden hover:border-black transition-colors duration-200 cursor-pointer bg-card h-full">
      <div className="aspect-[3/4] relative bg-secondary w-full overflow-hidden">
        {/* Placeholder for actual image or Next.js Image if URL provided */}
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
        
        {/* Status Badge Overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
            {item.platforms.map(p => (
                <Badge key={p} variant="secondary" className="rounded-none text-[10px] uppercase tracking-wider bg-white/90 backdrop-blur-sm border border-black/10">
                    {p}
                </Badge>
            ))}
        </div>
      </div>
      <CardContent className="p-3 space-y-1">
        <h3 className="font-bold text-sm tracking-tight uppercase truncate">{item.title}</h3>
        <p className="text-sm text-muted-foreground font-mono">{item.currency === 'USD' ? '$' : ''}{item.price.toFixed(2)} {item.currency}</p>
      </CardContent>
    </Card>
    </Link>
  );
}
