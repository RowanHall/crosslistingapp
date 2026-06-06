import { createClient } from "@/utils/supabase/server";
import { Navbar } from "@/components/layout/Navbar";
import { DepopCrosslistButton } from "@/components/listing/DepopCrosslistButton";
import { FacebookCrosslistButton } from "@/components/listing/FacebookCrosslistButton";
import { GrailedCrosslistButton } from "@/components/listing/GrailedCrosslistButton";
import { ShopifyCrosslistButton } from "@/components/listing/ShopifyCrosslistButton";
import { EbayCrosslistButton } from "@/components/listing/EbayCrosslistButton";
import { ImageGallery } from "@/components/listing/ImageGallery";
import { PlatformLoginReminder } from "@/components/ui/PlatformLoginReminder";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const COND = { fontFamily: "var(--font-barlow)", fontWeight: 900 } as const;
const SERIF = { fontFamily: "var(--font-cormorant), Georgia, serif" } as const;
const MONO = { fontFamily: "var(--font-dm-mono), 'Courier New', monospace" } as const;

const shortLot = (id: string) =>
    id.replace(/-/g, "").slice(0, 8).toUpperCase();

const fmtDate = (d?: string | null) => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    return date
        .toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
        .toUpperCase();
};

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

    const platformsStatus: Record<string, string> =
        (listing.platforms_status as Record<string, string>) || {};

    const channelKeys = ["facebook", "grailed", "ebay", "shopify", "depop"] as const;
    type ChannelKey = typeof channelKeys[number];

    // An item imported from a marketplace sync is, by definition, currently live
    // on that source platform — even if older rows still carry `"draft"` from
    // before the data-layer fix. We treat any non-closed status on the source
    // platform as live, and surface a small "verify it's published" note so
    // users know to double-check.
    const closedStates = new Set(["unlisted", "sold", "deleted"]);
    const platformState = (
        k: ChannelKey
    ): { isLive: boolean; sourceInferred: boolean } => {
        const status = platformsStatus[k];
        if (status === "listed") return { isLive: true, sourceInferred: false };
        if (listing.source === k && !closedStates.has(status ?? "")) {
            return { isLive: true, sourceInferred: true };
        }
        return { isLive: false, sourceInferred: false };
    };
    const states: Record<ChannelKey, { isLive: boolean; sourceInferred: boolean }> = {
        facebook: platformState("facebook"),
        grailed: platformState("grailed"),
        ebay: platformState("ebay"),
        shopify: platformState("shopify"),
        depop: platformState("depop"),
    };

    const verifyNote = (k: ChannelKey, platformLabel: string): string | null =>
        states[k].sourceInferred
            ? `Imported from ${platformLabel} — verify it's published there.`
            : null;

    const isDepopSource = listing.source === "depop";
    const liveCount = channelKeys.filter((k) => states[k].isLive).length;
    const totalChannels = channelKeys.length;

    // Source-platform items don't always have their *_listing_url set, but we
    // can reconstruct Facebook's from external_id when needed.
    const fbDerivedUrl =
        listing.source === "facebook" && listing.external_id
            ? `https://www.facebook.com/marketplace/item/${listing.external_id}/`
            : null;
    const grailedDerivedUrl =
        listing.source === "grailed" && listing.external_id
            ? `https://www.grailed.com/listings/${listing.external_id}`
            : null;

    const lotNo = shortLot(listing.id);
    const consignedOn = fmtDate(listing.created_at);
    const currency = listing.currency || "USD";

    return (
        <div className="grain-overlay min-h-screen bg-background text-foreground font-sans selection:bg-[#2D6A4F] selection:text-white">
            <Navbar />

            <main className="container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
                {/* breadcrumb back */}
                <div className="mb-4 flex items-center justify-between">
                    <Link
                        href="/inventory"
                        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors"
                        style={MONO}
                    >
                        <ChevronLeft className="w-3 h-3" />
                        Back to inventory
                    </Link>
                    <div
                        className="hidden sm:block text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
                        style={MONO}
                    >
                        Lot No. {lotNo}
                        {consignedOn ? ` · Consigned ${consignedOn}` : ""}
                    </div>
                </div>

                <div className="mb-6">
                    <PlatformLoginReminder compact />
                </div>

                {/* ═════ LOT HEADER ═════ */}
                <header className="border-y border-border py-7 mb-10">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                        <div className="min-w-0 flex-1">
                            <div
                                className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-3"
                                style={MONO}
                            >
                                Section ⁄ 01 · The lot
                            </div>
                            <h1
                                className="uppercase tracking-tighter leading-[0.88] text-[44px] sm:text-[58px] md:text-[68px]"
                                style={COND}
                            >
                                {listing.title}
                            </h1>
                            {listing.brand && (
                                <div className="mt-4 inline-flex items-baseline gap-3">
                                    <span
                                        className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground"
                                        style={MONO}
                                    >
                                        By
                                    </span>
                                    <span
                                        className="text-xl italic"
                                        style={SERIF}
                                    >
                                        {listing.brand}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Price block — newspaper masthead style */}
                        <div className="md:text-right shrink-0 border-t md:border-t-0 md:border-l border-border md:pl-8 pt-6 md:pt-0">
                            <div
                                className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-1.5"
                                style={MONO}
                            >
                                Asking
                            </div>
                            <div className="flex items-baseline gap-2 md:justify-end">
                                <span
                                    className="text-5xl md:text-6xl tracking-tighter leading-none"
                                    style={COND}
                                >
                                    ${listing.price}
                                </span>
                                <span
                                    className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground"
                                    style={MONO}
                                >
                                    {currency}
                                </span>
                            </div>
                            <div
                                className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                                style={MONO}
                            >
                                <span style={{ color: "var(--primary)" }}>●</span>{" "}
                                Live on {liveCount} ⁄ {totalChannels} platforms
                            </div>
                        </div>
                    </div>
                </header>

                {/* ═════ DETAIL GRID ═════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-16">
                    {/* Image gallery */}
                    <div className="lg:col-span-7">
                        <ImageGallery images={listing.images || []} title={listing.title} />
                    </div>

                    {/* Right column: stat grid + description */}
                    <div className="lg:col-span-5 flex flex-col gap-7">
                        {/* Stat grid — gap-px on a bg-border parent draws hairline separators */}
                        <div className="grid grid-cols-2 gap-px bg-border border border-border">
                            <StatCell label="Condition" value={listing.condition} />
                            <StatCell
                                label="Photos"
                                value={
                                    listing.images?.length
                                        ? `${String(listing.images.length).padStart(2, "0")} on file`
                                        : "—"
                                }
                            />
                            <StatCell
                                label="Status"
                                value={
                                    liveCount === 0
                                        ? "Not yet listed"
                                        : liveCount === totalChannels
                                        ? "Listed everywhere"
                                        : `Listed · ${liveCount}/${totalChannels}`
                                }
                            />
                            <StatCell label="Lot No." value={lotNo} mono />
                        </div>

                        {/* Description block — editorial */}
                        <article>
                            <div
                                className="flex items-baseline justify-between mb-4 pb-2 border-b border-border"
                                style={MONO}
                            >
                                <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                                    Description
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                                    §
                                </span>
                            </div>
                            <p
                                className="text-[17px] leading-[1.6] whitespace-pre-wrap text-foreground/90"
                                style={SERIF}
                            >
                                {listing.description || "No description provided."}
                            </p>
                        </article>
                    </div>
                </div>

                {/* ═════ MARKETPLACES LEDGER ═════ */}
                <section aria-label="Marketplaces" className="mb-16">
                    <div className="flex items-end justify-between gap-6 mb-5 pb-3 border-b border-border">
                        <div>
                            <div
                                className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-2"
                                style={MONO}
                            >
                                Section ⁄ 02 · Marketplaces
                            </div>
                            <h2
                                className="text-[32px] sm:text-[40px] uppercase tracking-tighter leading-none"
                                style={COND}
                            >
                                Sell everywhere
                            </h2>
                        </div>
                        <div className="text-right hidden sm:block">
                            <div
                                className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground"
                                style={MONO}
                            >
                                Live
                            </div>
                            <div
                                className="text-[10px] uppercase tracking-[0.22em] mt-1"
                                style={MONO}
                            >
                                {liveCount} ⁄ {totalChannels} platforms
                            </div>
                        </div>
                    </div>

                    <p
                        className="text-[12px] leading-relaxed text-muted-foreground max-w-xl mb-6"
                        style={MONO}
                    >
                        Post this item to each marketplace below. Sessions must
                        be active in your browser — see the notice above.
                        Updating a live listing pushes any edits.
                    </p>

                    {/* The ledger frame */}
                    <div className="relative border border-border bg-background/70">
                        {/* Decorative header strip */}
                        <div
                            className="flex items-center justify-between gap-4 px-5 py-2 border-b border-border bg-secondary/60"
                            style={MONO}
                        >
                            <span className="text-[9px] uppercase tracking-[0.28em] text-foreground/70">
                                ⁘ Marketplaces
                            </span>
                            <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                                Lot {lotNo}
                            </span>
                        </div>

                        {/* Tickets */}
                        <div className="divide-y divide-border">
                            <FacebookCrosslistButton
                                listingId={listing.id}
                                alreadyListed={states.facebook.isLive}
                                existingUrl={listing.facebook_listing_url ?? fbDerivedUrl}
                                note={verifyNote("facebook", "Facebook")}
                            />
                            <GrailedCrosslistButton
                                listingId={listing.id}
                                alreadyListed={states.grailed.isLive}
                                existingUrl={listing.grailed_listing_url ?? grailedDerivedUrl}
                                note={verifyNote("grailed", "Grailed")}
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
                            <ShopifyCrosslistButton
                                listingId={listing.id}
                                alreadyListed={states.shopify.isLive}
                                existingUrl={listing.shopify_listing_url ?? null}
                                note={verifyNote("shopify", "Shopify")}
                            />
                            <DepopCrosslistButton
                                listingId={listing.id}
                                alreadyListed={states.depop.isLive}
                                isDepopSource={isDepopSource}
                                listing={{
                                    title: listing.title,
                                    description: listing.description ?? null,
                                    price: listing.price,
                                    images: listing.images ?? [],
                                    brand: listing.brand ?? null,
                                    condition: listing.condition ?? null,
                                    size: listing.size ?? null,
                                }}
                            />
                        </div>

                        {/* Decorative footer strip */}
                        <div
                            className="flex items-center justify-between gap-4 px-5 py-2 border-t border-border bg-secondary/60"
                            style={MONO}
                        >
                            <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                                Crosslist Co. · One ledger
                            </span>
                            <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                                {channelKeys.length} platforms · 1 item
                            </span>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

function StatCell({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string | number | null | undefined;
    mono?: boolean;
}) {
    const display = value ?? "—";
    return (
        <div className="bg-background p-4">
            <div
                className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground mb-1.5"
                style={MONO}
            >
                {label}
            </div>
            <div
                className={
                    mono
                        ? "text-base uppercase tracking-[0.12em]"
                        : "text-lg uppercase tracking-tighter"
                }
                style={mono ? MONO : COND}
            >
                {display}
            </div>
        </div>
    );
}
