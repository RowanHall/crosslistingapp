import { Navbar } from "@/components/layout/Navbar";
import { InventoryItem } from "@/components/dashboard/InventoryCard";
import { InventoryContent } from "@/components/dashboard/InventoryContent";
import { createClient } from "@/utils/supabase/server";

export default async function InventoryPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const filter = typeof searchParams.filter === "string" ? searchParams.filter : "all";

  const supabase = await createClient();
  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) console.error("Error fetching listings:", error);

  const inventoryItems: InventoryItem[] = (listings || []).map((item: any) => {
    const platforms = Object.keys(item.platforms_status || {});
    const isListed  = Object.values(item.platforms_status || {}).some((s) => s === "listed");
    return {
      id:       item.id,
      title:    item.title,
      price:    item.price,
      currency: item.currency || "USD",
      imageUrl: item.images?.[0] || null,
      status:   isListed ? "listed" : "draft",
      platforms,
    };
  });

  const filteredItems =
    filter === "all"
      ? inventoryItems
      : inventoryItems.filter((item) => item.status === filter);

  return (
    <div className="grain-overlay min-h-screen bg-background text-foreground font-sans">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <InventoryContent
          items={filteredItems}
          rawListings={listings || []}
          filter={filter}
        />
      </main>
    </div>
  );
}
