import { createClient } from "@/utils/supabase/server";
import { Navbar } from "@/components/layout/Navbar";
import { CrossPostButton } from "@/components/listing/CrossPostButton";
import { FacebookCrosslistButton } from "@/components/listing/FacebookCrosslistButton";
import { GrailedCrosslistButton } from "@/components/listing/GrailedCrosslistButton";
import { EbayCrosslistButton } from "@/components/listing/EbayCrosslistButton";
import { ImageGallery } from "@/components/listing/ImageGallery";
import { notFound } from "next/navigation";

export default async function ListingDetailPage(props: {
    params: Promise<{ id: string }>;
}) {
    const params = await props.params;
    const { id } = params;
    const supabase = await createClient();

    const { data: listing, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !listing) {
        console.error("Listing not found", error);
        return notFound();
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 flex justify-between items-center">
                        <h1 className="text-3xl font-black uppercase tracking-tighter">{listing.title}</h1>
                        <div className="flex gap-4">
                            <CrossPostButton listing={listing} />
                            <FacebookCrosslistButton
                                listingId={listing.id}
                                alreadyListed={listing.platforms_status?.facebook === 'listed'}
                                existingUrl={listing.facebook_listing_url ?? null}
                            />
                            <GrailedCrosslistButton
                                listingId={listing.id}
                                alreadyListed={listing.platforms_status?.grailed === 'listed'}
                                existingUrl={listing.grailed_listing_url ?? null}
                            />
                            <EbayCrosslistButton
                                listing={{
                                    title: listing.title,
                                    description: listing.description ?? null,
                                    price: listing.price,
                                    images: listing.images ?? [],
                                    brand: listing.brand ?? null,
                                    condition: listing.condition ?? null,
                                }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Image Gallery */}
                        <ImageGallery 
                          images={listing.images || []} 
                          title={listing.title} 
                        />

                        {/* Details */}
                        <div className="space-y-6">
                            <div className="p-6 border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-1">Price</h2>
                                <p className="text-4xl font-black tracking-tighter">{listing.currency === 'USD' ? '$' : ''}{listing.price} {listing.currency}</p>
                            </div>

                            <div className="p-6 border-2 border-black rounded-lg">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Description</h2>
                                <p className="whitespace-pre-wrap text-lg leading-relaxed">{listing.description}</p>
                            </div>
                            
                            <div className="p-6 border-2 border-black rounded-lg bg-neutral-50">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-2">Cross-Listing Status</h2>
                                <div className="grid grid-cols-2 gap-4">
                                     {Object.entries(listing.platforms_status || {}).map(([platform, status]) => (
                                         <div key={platform} className="flex justify-between items-center border border-black p-2 bg-white">
                                             <span className="capitalize font-bold">{platform}</span>
                                             <span className={`text-xs px-2 py-1 rounded-full uppercase font-bold tracking-wide ${status === 'listed' ? 'bg-green-200 text-green-800' : 'bg-neutral-200 text-neutral-800'}`}>
                                                 {String(status)}
                                             </span>
                                         </div>
                                     ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
