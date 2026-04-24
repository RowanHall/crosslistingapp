"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const FEATURES = [
  "Unlimited cross-listings",
  "Facebook Marketplace",
  "Grailed",
  "eBay",
  "Depop",
  "Bulk import & sync",
  "One-click crosslist from inventory",
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
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-black uppercase tracking-tighter">Crosslist</span>
        <a
          href="/login"
          className="text-xs uppercase tracking-widest font-bold border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
        >
          Log In
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-24">
        <div className="max-w-md w-full space-y-12 text-center">
          <div className="space-y-4">
            <h1 className="text-6xl font-black uppercase tracking-tighter leading-none">Crosslist</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest">
              List everywhere. Sell faster.
            </p>
          </div>

          <div className="border border-black p-8 space-y-8 text-left">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Monthly Plan</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter">$19.99</span>
                <span className="text-sm text-muted-foreground uppercase tracking-widest">/ month</span>
              </div>
            </div>

            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 border border-black flex-shrink-0 flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
              {loading ? "Loading..." : "Subscribe"}
            </button>
          </div>

          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Cancel anytime. Billing managed by Stripe.
          </p>
        </div>
      </main>
    </div>
  );
}
