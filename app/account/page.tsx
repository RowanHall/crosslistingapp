import { Navbar } from "@/components/layout/Navbar";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { disconnectEbayAccount, getEbayConnectionStatus } from "@/actions/ebay";
import { connectEbay, saveShopifyCredentials } from "@/app/account/actions";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isEbayConnected = await getEbayConnectionStatus();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .single();

  const { data: shopifyIntegration } = await supabase
    .from("user_integrations")
    .select("metadata")
    .eq("user_id", user.id)
    .eq("platform", "shopify")
    .single();

  const isShopifyConnected = !!shopifyIntegration;
  const shopifyStoreName = (shopifyIntegration?.metadata as any)?.store_name ?? null;

  return (
    <div className="grain-overlay min-h-screen bg-background text-foreground font-sans">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-12">
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Account</h1>
            <p className="text-muted-foreground text-sm tracking-wide">SETTINGS & INTEGRATIONS</p>
        </div>

        <div className="space-y-12">
            {/* Billing Section */}
            <section className="space-y-6">
                <h2 className="text-xl font-bold uppercase tracking-tight border-b border-border pb-2">Billing</h2>
                {subscription?.status === 'active' ? (
                    <div className="flex items-center justify-between p-4 border border-border">
                        <div className="space-y-1">
                            <p className="font-bold uppercase tracking-wider text-sm">Pro — $19.99/month</p>
                            {subscription.current_period_end && (
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                    Renews {new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                        <ManageSubscriptionButton />
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-4 border border-border">
                        <p className="text-sm uppercase tracking-wider text-muted-foreground">No active subscription</p>
                        <a
                            href="/"
                            className="text-xs uppercase tracking-widest font-bold border border-border px-4 py-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        >
                            Subscribe
                        </a>
                    </div>
                )}
            </section>

            {/* Profile Section */}
            <section className="space-y-6">
                <h2 className="text-xl font-bold uppercase tracking-tight border-b border-border pb-2">Profile</h2>
                <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email Address</Label>
                    <Input 
                        value={user.email} 
                        readOnly 
                        className="rounded-none border-x-0 border-t-0 border-b border-border px-0 font-mono text-lg bg-transparent focus-visible:ring-0" 
                    />
                </div>
            </section>

            {/* Connected Accounts Section */}
            <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-2">
                    <h2 className="text-xl font-bold uppercase tracking-tight">Connected Accounts</h2>
                </div>
                
                <div className="space-y-6">
                    {/* eBay Connection */}
                    <div className="flex items-center justify-between p-4 border border-border">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isEbayConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold uppercase tracking-wider">eBay</span>
                        </div>
                        {isEbayConnected ? (
                            <form action={async () => {
                                "use server";
                                await disconnectEbayAccount();
                            }}>
                                <Button variant="outline" className="rounded-none border-border text-xs uppercase tracking-widest hover:bg-muted">
                                    Disconnect
                                </Button>
                            </form>
                        ) : (
                            <form action={connectEbay}>
                                <Button className="rounded-none bg-primary text-primary-foreground hover:opacity-90 border-0 text-xs uppercase tracking-widest">
                                    Connect eBay
                                </Button>
                            </form>
                        )}
                    </div>

                    {/* Shopify Connection */}
                    <div className="p-4 border border-border space-y-3">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isShopifyConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold uppercase tracking-wider">Shopify</span>
                            {isShopifyConnected && shopifyStoreName && (
                                <span className="text-xs text-muted-foreground font-mono">{shopifyStoreName}</span>
                            )}
                        </div>
                        <form className="flex flex-col gap-2">
                            <Input
                                name="store_url"
                                placeholder={isShopifyConnected ? "Store URL (unchanged)" : "my-store.myshopify.com"}
                                className="rounded-none border-border h-8 text-xs bg-background"
                            />
                            <div className="flex gap-2">
                                <Input
                                    name="access_token"
                                    type="password"
                                    placeholder={isShopifyConnected ? "Access token (unchanged)" : "shpat_..."}
                                    className="rounded-none border-border h-8 text-xs flex-1 bg-background font-mono"
                                />
                                <Button
                                    formAction={saveShopifyCredentials}
                                    className="rounded-none bg-primary text-primary-foreground hover:opacity-90 text-xs uppercase tracking-widest h-8"
                                >
                                    {isShopifyConnected ? "Update" : "Connect"}
                                </Button>
                            </div>
                        </form>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Create a custom app in Shopify Admin → Apps → Develop apps, then copy the Admin API access token.
                        </p>
                    </div>

                </div>
            </section>
        </div>
      </main>
    </div>
  );
}
