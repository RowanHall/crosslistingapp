import { Navbar } from "@/components/layout/Navbar";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all listings for the user
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .eq("user_id", user.id);

  const allListings = listings || [];
  
  // Calculate Metrics
  const soldItems = allListings.filter(item => {
      // Check if any platform status is 'sold'
      const status = item.platforms_status || {};
      return Object.values(status).some(s => s === 'sold');
  });

  const activeItems = allListings.filter(item => {
      const status = item.platforms_status || {};
      // Active if listed on at least one platform and not sold
      const isListed = Object.values(status).some(s => s === 'listed');
      const isSold = Object.values(status).some(s => s === 'sold');
      return isListed && !isSold;
  });

  const totalRevenue = soldItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const totalItemsCount = allListings.length;
  const sellThroughRate = totalItemsCount > 0 ? ((soldItems.length / totalItemsCount) * 100).toFixed(1) : "0.0";
  const avgSalePrice = soldItems.length > 0 ? (totalRevenue / soldItems.length).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-12">
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Analytics</h1>
            <p className="text-muted-foreground text-sm tracking-wide">PERFORMANCE OVERVIEW</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border mb-12">
            <MetricCard title="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} />
            <MetricCard title="Active Listings" value={activeItems.length.toString()} />
            <MetricCard title="Sell-Through Rate" value={`${sellThroughRate}%`} />
            <MetricCard title="Avg Sale Price" value={`$${avgSalePrice}`} />
        </div>

        {/* Recent Sales Table (Placeholder for now) */}
        <div className="space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-tight">Recent Sales</h2>
            <div className="border border-border">
                <div className="grid grid-cols-4 p-4 border-b border-border bg-secondary/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <div>Item</div>
                    <div>Price</div>
                    <div>Platform</div>
                    <div>Date</div>
                </div>
                {soldItems.length > 0 ? (
                    soldItems.slice(0, 5).map(item => (
                        <div key={item.id} className="grid grid-cols-4 p-4 border-b border-border last:border-0 text-sm font-medium">
                            <div className="truncate pr-4">{item.title}</div>
                            <div className="font-mono">${item.price}</div>
                            <div className="uppercase text-xs text-muted-foreground">Mixed</div>
                            <div className="font-mono text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm uppercase tracking-wide">
                        No sales yet.
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value }: { title: string, value: string }) {
    return (
        <div className="bg-background p-8 flex flex-col justify-between h-48 hover:bg-secondary/10 transition-colors">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
            <span className="text-5xl lg:text-6xl font-black tracking-tighter mt-4">{value}</span>
        </div>
    )
}
