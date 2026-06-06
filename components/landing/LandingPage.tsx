import Link from "next/link";

const PLATFORMS = ["DEPOP", "GRAILED", "SHOPIFY", "FACEBOOK", "EBAY"];

export function LandingPage() {
  return (
    <>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.3334%); }
        }
        .marquee-track {
          animation: marquee 22s linear infinite;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-eyebrow { animation: fadeUp 0.5s ease both; }
        .hero-h1      { animation: fadeUp 0.5s 0.1s ease both; }
        .hero-sub     { animation: fadeUp 0.5s 0.2s ease both; }
        .hero-cta     { animation: fadeUp 0.5s 0.3s ease both; }
      `}</style>

      <div className="min-h-screen font-mono bg-white text-black selection:bg-black selection:text-white">

        {/* ── NAV ─────────────────────────────────────────────── */}
        <nav className="fixed top-0 inset-x-0 z-50 h-11 bg-black border-b border-white/10 flex items-center justify-between px-5">
          <span className="text-xs font-bold tracking-[0.35em] text-white">X-LIST</span>
          <Link
            href="/login"
            className="text-[10px] font-bold tracking-[0.25em] uppercase text-white border border-white/30 px-4 py-1.5 hover:bg-white hover:text-black transition-colors duration-150"
          >
            LOG IN
          </Link>
        </nav>

        {/* ── HERO ────────────────────────────────────────────── */}
        <section className="bg-black text-white pt-11 min-h-svh flex flex-col justify-center px-5 md:px-10 overflow-hidden relative">
          {/* grid lines for texture */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          <div className="relative max-w-6xl mx-auto w-full py-24">
            <p className="hero-eyebrow text-[10px] tracking-[0.4em] text-white/40 uppercase mb-7">
              CROSSLISTING SOFTWARE — FOR RESELLERS
            </p>

            <h1 className="hero-h1 font-bold uppercase leading-[0.88] tracking-tight mb-10"
              style={{ fontSize: "clamp(3.2rem, 11vw, 10rem)" }}>
              List once.<br />
              <span className="text-white/20">Sell</span><br />
              everywhere.
            </h1>

            <p className="hero-sub text-sm text-white/50 max-w-sm leading-relaxed tracking-wide font-sans mb-10">
              Stop copy-pasting the same listing to Depop, Grailed, Shopify, Facebook, and eBay.
              X-LIST imports your inventory and cross-posts with one click.
            </p>

            <div className="hero-cta flex flex-col sm:flex-row items-start gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-white text-black text-xs font-bold tracking-[0.25em] uppercase px-8 py-4 border border-transparent hover:bg-black hover:text-white hover:border-white transition-colors duration-150"
              >
                GET EARLY ACCESS <span aria-hidden>→</span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 text-white/40 text-xs font-bold tracking-[0.2em] uppercase px-4 py-4 hover:text-white transition-colors"
              >
                SEE HOW IT WORKS ↓
              </a>
            </div>
          </div>

          {/* scroll nudge */}
          <div className="absolute bottom-8 right-8 text-white/15 text-[10px] tracking-[0.3em] rotate-90 origin-right">
            SCROLL
          </div>
        </section>

        {/* ── PLATFORM MARQUEE ────────────────────────────────── */}
        <div className="border-y border-black py-3 overflow-hidden bg-white">
          <div className="marquee-track flex whitespace-nowrap">
            {[...PLATFORMS, ...PLATFORMS, ...PLATFORMS].map((p, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.35em] uppercase px-7 text-black inline-flex items-center gap-7">
                {p}
                <span className="text-black/20 font-normal">·</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── HOW IT WORKS ────────────────────────────────────── */}
        <section id="how-it-works" className="bg-white border-b border-black px-5 md:px-10 py-24">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-baseline gap-4 mb-16">
              <p className="text-[10px] tracking-[0.4em] uppercase text-black/40">01</p>
              <p className="text-[10px] tracking-[0.4em] uppercase">HOW IT WORKS</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 border border-black">
              {[
                {
                  num: "01",
                  title: "IMPORT",
                  desc: "Install the Chrome extension. One click pulls your entire Depop or Grailed store — titles, prices, photos and all — into your dashboard.",
                },
                {
                  num: "02",
                  title: "MANAGE",
                  desc: "One central place for every listing. Filter by status, update prices, and see which platforms each item is already live on.",
                },
                {
                  num: "03",
                  title: "CROSSLIST",
                  desc: "Hit post. X-LIST publishes your item to Shopify, Facebook Marketplace, eBay — all at once, formatted correctly for each platform.",
                },
              ].map((step, i) => (
                <div
                  key={i}
                  className={`p-8 md:p-10 ${i < 2 ? "border-b md:border-b-0 md:border-r border-black" : ""} group`}
                >
                  <p className="text-7xl font-bold text-black/5 mb-6 group-hover:text-black/10 transition-colors duration-300">
                    {step.num}
                  </p>
                  <p className="text-[10px] font-bold tracking-[0.35em] uppercase mb-4">{step.title}</p>
                  <p className="text-sm text-black/50 leading-relaxed font-sans">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ────────────────────────────────────────── */}
        <section className="bg-[#F5F5F5] border-b border-black px-5 md:px-10 py-24">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-baseline gap-4 mb-16">
              <p className="text-[10px] tracking-[0.4em] uppercase text-black/40">02</p>
              <p className="text-[10px] tracking-[0.4em] uppercase">FEATURES</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  label: "BULK IMPORT",
                  tag: "CHROME EXTENSION",
                  desc: "Scrapes your entire store and imports every listing in seconds. Works with Depop and Grailed.",
                },
                {
                  label: "ONE-CLICK CROSSLISTING",
                  tag: "AUTOMATION",
                  desc: "Post to multiple platforms simultaneously. No tab-switching, no reformatting, no copy-paste.",
                },
                {
                  label: "ANALYTICS",
                  tag: "INSIGHTS",
                  desc: "Revenue, sell-through rate, average sale price, and active listing count — all in one dashboard.",
                },
                {
                  label: "MULTI-PLATFORM",
                  tag: "5 PLATFORMS",
                  desc: "Depop, Grailed, Shopify, Facebook Marketplace, and eBay. All connected. All managed here.",
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="bg-white border border-black p-8 shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#000] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all duration-150 cursor-default"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <p className="text-xs font-bold tracking-[0.2em] uppercase leading-tight">{f.label}</p>
                    <span className="shrink-0 text-[9px] font-bold tracking-[0.2em] uppercase border border-black/20 px-2 py-0.5 text-black/40">
                      {f.tag}
                    </span>
                  </div>
                  <p className="text-sm text-black/50 leading-relaxed font-sans">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ─────────────────────────────────────────── */}
        <section className="bg-black text-white px-5 md:px-10 py-24">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-baseline gap-4 mb-16">
              <p className="text-[10px] tracking-[0.4em] uppercase text-white/25">03</p>
              <p className="text-[10px] tracking-[0.4em] uppercase text-white/50">PRICING</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
              <div>
                <p className="font-bold leading-none tracking-tight uppercase mb-6"
                  style={{ fontSize: "clamp(2rem, 6vw, 5rem)" }}>
                  Simple.<br />Flat rate.<br />No surprises.
                </p>
                <p className="text-sm text-white/40 leading-relaxed font-sans max-w-xs">
                  One plan. Everything included. Early access users lock in the launch price forever.
                </p>
              </div>

              <div className="border border-white/20 p-10 relative">
                <div className="absolute top-4 right-4 text-[9px] tracking-[0.3em] uppercase text-white/25 border border-white/10 px-2 py-0.5">
                  EARLY ACCESS
                </div>
                <p className="text-[10px] tracking-[0.35em] uppercase text-white/30 mb-3">Monthly</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-6xl font-bold">$?</span>
                  <span className="text-white/30 text-sm font-sans">/ mo</span>
                </div>
                <p className="text-xs text-white/30 tracking-wide mb-8">Pricing announced at launch</p>

                <ul className="space-y-3 mb-10">
                  {[
                    "Unlimited listings",
                    "All 5 platforms",
                    "Chrome extension",
                    "Analytics dashboard",
                    "Early access pricing locked in",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-xs text-white/60 font-sans tracking-wide">
                      <span className="text-white/30">—</span>
                      {item}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login"
                  className="block text-center text-xs font-bold tracking-[0.25em] uppercase py-4 border border-white hover:bg-white hover:text-black transition-colors duration-150"
                >
                  JOIN WAITLIST →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ───────────────────────────────────────── */}
        <section className="bg-white border-b border-black px-5 md:px-10 py-24">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start lg:items-end justify-between gap-12">
            <div>
              <p className="text-[10px] tracking-[0.4em] uppercase text-black/30 mb-6">READY?</p>
              <p
                className="font-bold leading-[0.9] uppercase tracking-tight"
                style={{ fontSize: "clamp(2rem, 7vw, 6rem)" }}
              >
                Stop<br />copy-pasting.<br />
                <span className="text-black/20">Start selling.</span>
              </p>
            </div>
            <Link
              href="/login"
              className="shrink-0 inline-flex items-center gap-3 bg-black text-white text-xs font-bold tracking-[0.25em] uppercase px-10 py-5 border border-transparent hover:bg-white hover:text-black hover:border-black transition-colors duration-150"
            >
              GET STARTED <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <footer className="bg-black text-white px-5 md:px-10 py-5 flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.35em] uppercase">X-LIST</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[10px] tracking-[0.25em] uppercase text-white/30 hover:text-white transition-colors">
              Log in
            </Link>
            <span className="text-[10px] text-white/20 tracking-wide">© 2026</span>
          </div>
        </footer>

      </div>
    </>
  );
}
