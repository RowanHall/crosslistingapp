import { Navbar } from "@/components/layout/Navbar";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { disconnectEbayAccount, getEbayConnectionStatus } from "@/actions/ebay";
import { connectEbay, saveDepopToken } from "@/app/account/actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isEbayConnected = await getEbayConnectionStatus();
  
  const { data: depopIntegration } = await supabase
    .from("user_integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "depop")
    .single();
    
  const isDepopConnected = !!depopIntegration;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-12">
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Account</h1>
            <p className="text-muted-foreground text-sm tracking-wide">SETTINGS & INTEGRATIONS</p>
        </div>

        <div className="space-y-12">
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
                                <Button variant="outline" className="rounded-none border-black text-xs uppercase tracking-widest hover:bg-black hover:text-white">
                                    Disconnect
                                </Button>
                            </form>
                        ) : (
                            <form action={connectEbay}>
                                <Button className="rounded-none bg-black text-white hover:invert border border-black text-xs uppercase tracking-widest">
                                    Connect eBay
                                </Button>
                            </form>
                        )}
                    </div>

                    {/* Depop Connection */}
                    <div className="flex items-center justify-between p-4 border border-border">
                         <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isDepopConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold uppercase tracking-wider">Depop</span>
                        </div>
                        {isDepopConnected ? (
                            <form className="flex flex-col gap-2 w-full">
                                <div className="flex gap-2">
                                    <Input 
                                        name="token" 
                                        placeholder="••••• (Unchanged)" 
                                        className="rounded-none border-black h-8 text-xs flex-1" 
                                    />
                                    <Button 
                                        formAction={saveDepopToken}
                                        className="rounded-none bg-black text-white hover:invert border border-black text-xs uppercase tracking-widest h-8"
                                    >
                                        Update
                                    </Button>
                                </div>
                                <Textarea 
                                    name="cookie" 
                                    placeholder="Update Cookie String (Required for Bot Protection)" 
                                    className="rounded-none border-black text-xs w-full min-h-[100px] font-mono" 
                                />
                            </form>
                        ) : (
                            <form className="flex flex-col gap-2 w-full">
                                <div className="flex gap-2">
                                    <Input 
                                        name="token" 
                                        placeholder="Paste Auth Token" 
                                        className="rounded-none border-black h-8 text-xs flex-1" 
                                        required
                                    />
                                    <Button 
                                        formAction={saveDepopToken}
                                        className="rounded-none bg-black text-white hover:invert border border-black text-xs uppercase tracking-widest h-8"
                                    >
                                        Save
                                    </Button>
                                </div>
                                <Textarea 
                                    name="cookie" 
                                    placeholder="Paste Cookie String (Required for Bot Protection)" 
                                    className="rounded-none border-black text-xs w-full min-h-[100px] font-mono" 
                                    required
                                />
                            </form>
                        )}
                    </div>

                    {/* Placeholders for others */}
                    <div className="space-y-2 opacity-40 pointer-events-none grayscale">
                        <div className="flex items-center justify-between p-4 border border-border">
                             <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-gray-300" />
                                <span className="font-bold uppercase tracking-wider">Poshmark</span>
                            </div>
                            <Button disabled variant="outline" className="rounded-none text-xs uppercase tracking-widest">Connect</Button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
      </main>
    </div>
  );
}
