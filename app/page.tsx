"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATFORMS = [
  { name: "Facebook Marketplace", abbr: "FB" },
  { name: "Grailed", abbr: "GR" },
  { name: "eBay", abbr: "EB" },
  { name: "Depop", abbr: "DP" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Import Your Inventory",
    desc: "Connect your existing listings from any platform. Our browser extension scrapes and imports everything in one click.",
  },
  {
    step: "02",
    title: "One-Click Crosslist",
    desc: "Select a listing and push it to every platform simultaneously. No copy-pasting, no reformatting.",
  },
  {
    step: "03",
    title: "Sell More",
    desc: "More platforms means more eyeballs. Reach every buyer, on every marketplace, at the same time.",
  },
];

const FEATURES = [
  "Unlimited cross-listings",
  "Facebook Marketplace",
  "Grailed",
  "eBay",
  "Depop",
  "Bulk import & sync",
  "One-click crosslist from inventory",
  "Browser extension included",
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white flex flex-col">
      {/* Nav */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background z-10">
        <span className="text-xl font-black uppercase tracking-tighter">Crosslist</span>
        <a
          href="/login"
          className="text-xs uppercase tracking-widest font-bold border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
        >
          Log In
        </a>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border px-6 py-32 flex flex-col items-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            The reseller&apos;s unfair advantage
          </p>
          <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-none mb-8">
            List once.<br />Sell everywhere.
          </h1>
          <p className="text-base text-muted-foreground max-w-md mb-12 leading-relaxed">
            Crosslist pushes your items to Facebook Marketplace, Grailed, eBay, and Depop simultaneously — from a single inventory dashboard.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="bg-black text-white text-sm uppercase tracking-widest font-bold px-10 py-4 hover:bg-white hover:text-black border border-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Get Started — $19.99/mo"}
          </button>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-4">
            Cancel anytime.
          </p>
        </section>

        {/* Platforms */}
        <section className="border-b border-border px-6 py-16">
          <p className="text-xs uppercase tracking-widest text-muted-foreground text-center mb-10">
            Cross-post to every major resale platform
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 max-w-3xl mx-auto">
            {PLATFORMS.map((p, i) => (
              <div
                key={p.name}
                className={`flex flex-col items-center justify-center py-10 gap-3 border-black ${
                  i < PLATFORMS.length - 1 ? "border-r" : ""
                } border-b md:border-b-0`}
              >
                <span className="text-3xl font-black tracking-tighter">{p.abbr}</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{p.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-border px-6 py-24">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">How it works</p>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-16">Three steps to everywhere.</h2>
            <div className="grid md:grid-cols-3 gap-0">
              {HOW_IT_WORKS.map((item, i) => (
                <div
                  key={item.step}
                  className={`py-8 pr-8 ${i < HOW_IT_WORKS.length - 1 ? "md:border-r border-black" : ""} ${i > 0 ? "md:pl-8" : ""}`}
                >
                  <span className="text-5xl font-black tracking-tighter text-muted-foreground/30">{item.step}</span>
                  <h3 className="text-lg font-black uppercase tracking-tight mt-4 mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Crosslist */}
        <section className="border-b border-border px-6 py-24 bg-black text-white">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-widest text-white/50 mb-2">Why Crosslist</p>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-12">Stop leaving money on the table.</h2>
            <div className="grid md:grid-cols-2 gap-12">
              <p className="text-sm text-white/70 leading-relaxed">
                Most resellers list on one or two platforms and call it a day. Meanwhile, their items sit unsold while buyers on other platforms never see them. Crosslist changes that. One dashboard, every platform, zero extra work.
              </p>
              <p className="text-sm text-white/70 leading-relaxed">
                Built for resellers who move volume — whether you&apos;re flipping streetwear on Grailed, vintage on eBay, or everyday items on Facebook Marketplace. If you&apos;re serious about selling, you need to be everywhere at once.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="px-6 py-32 flex flex-col items-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Pricing</p>
          <h2 className="text-4xl font-black uppercase tracking-tighter mb-16 text-center">Simple. One plan.</h2>

          <div className="border border-black p-10 max-w-md w-full space-y-8">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Monthly Plan</p>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-black tracking-tighter">$19.99</span>
                <span className="text-sm text-muted-foreground uppercase tracking-widest">/ month</span>
              </div>
            </div>

            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 border border-black flex-shrink-0 flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="uppercase tracking-wide font-medium">{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-black text-white text-sm uppercase tracking-widest font-bold py-4 hover:bg-white hover:text-black border border-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Subscribe Now"}
            </button>

            <p className="text-xs text-muted-foreground uppercase tracking-widest text-center">
              Cancel anytime. Billing managed by Stripe.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest">
        <span>Crosslist</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
