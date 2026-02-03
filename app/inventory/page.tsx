import { Navbar } from "@/components/layout/Navbar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { InventoryGrid } from "@/components/dashboard/InventoryGrid";
import { InventoryItem } from "@/components/dashboard/InventoryCard";
import { createClient } from "@/utils/supabase/server";
import { DepopSyncButton } from "@/components/dashboard/DepopSyncButton";

export default async function InventoryPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const filter = typeof searchParams.filter === "string" ? searchParams.filter : "all";
  
  const supabase = await createClient();

  // Fetch data from Supabase
  const { data: listings, error } = await supabase
    .from('listings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching listings:', error);
  }

  // Map Supabase data to InventoryItem interface
  const inventoryItems: InventoryItem[] = (listings || []).map((item: any) => {
    // Determine overall status based on platforms_status
    // For MVP, if any platform is 'listed', status is 'listed'. 
    // If empty platforms, 'draft'.
    const platforms = Object.keys(item.platforms_status || {});
    const isListed = Object.values(item.platforms_status || {}).some(status => status === 'listed');
    
    return {
      id: item.id,
      title: item.title,
      price: item.price,
      imageUrl: item.images?.[0] || null,
      status: isListed ? 'listed' : 'draft', // Simplified logic
      platforms: platforms,
    };
  });

  // Client-side filtering (or server-side if we wanted to add .eq() to query)
  const filteredItems = filter === "all" 
    ? inventoryItems 
    : inventoryItems.filter(item => item.status === filter);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
                <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">My Inventory</h1>
                <p className="text-muted-foreground text-sm tracking-wide">MANAGE YOUR LISTINGS ACROSS ALL PLATFORMS</p>
            </div>
            <DepopSyncButton />
        </div>
        
        <FilterBar currentFilter={filter} />
        
        <InventoryGrid items={filteredItems} />
      </main>
    </div>
  );
}
