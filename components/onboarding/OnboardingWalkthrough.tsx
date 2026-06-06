"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Download, LogIn, Package, Zap, ArrowRight, Check, ExternalLink } from "lucide-react";

const PLATFORM_LINKS = [
  { name: "Facebook", url: "https://www.facebook.com/marketplace", icon: "/platforms/facebook2.svg" },
  { name: "Grailed", url: "https://www.grailed.com", icon: "/platforms/grailed.png" },
  { name: "Depop", url: "https://www.depop.com", icon: "/platforms/depop.png" },
  { name: "eBay", url: "https://www.ebay.com", icon: "/platforms/ebay.png" },
];

const STEPS = [
  {
    icon: Download,
    title: "Install the Extension",
    body: "Our Chrome extension connects your marketplace accounts automatically. It captures login sessions from Depop, Grailed, Facebook, and eBay so you never have to copy-paste tokens.",
    detail: "Once installed, just log into your marketplace accounts normally — the extension handles the rest.",
    cta: "Download Extension",
    ctaAction: "extension" as const,
  },
  {
    icon: LogIn,
    title: "Log Into Your Platforms",
    body: "Open each marketplace in a separate tab and make sure you're signed in. The extension detects your sessions automatically — no extra steps needed.",
    detail: "You need to be logged in whenever you sync or crosslist. If a session expires, just revisit the platform to refresh it.",
    cta: null,
    ctaAction: "platforms" as const,
  },
  {
    icon: Package,
    title: "Import Your Inventory",
    body: "Use the Sync button at the top of your inventory to pull in existing listings from any connected platform.",
    detail: "Select which platforms to sync from, hit Sync Now, and your listings will appear in your inventory within seconds.",
    cta: null,
    ctaAction: null,
  },
  {
    icon: Zap,
    title: "Crosslist in One Click",
    body: "Select any listing and push it to every marketplace simultaneously. No copy-pasting, no reformatting — just click and sell.",
    detail: "Open a listing, toggle on the platforms you want, and hit Crosslist. We handle the formatting for each platform automatically.",
    cta: null,
    ctaAction: null,
  },
];

export function OnboardingWalkthrough({ userId }: { userId: string }) {
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  async function complete() {
    setClosing(true);
    const supabase = createClient();
    await supabase
      .from("subscriptions")
      .update({ onboarding_completed: true })
      .eq("user_id", userId);
  }

  function next() {
    if (isLast) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  }

  if (closing) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40" onClick={complete} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 border border-border bg-background">
        {/* Skip */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>

        <div className="p-8 pt-10">
          {/* Step indicator */}
          <div className="flex gap-2 mb-8">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 transition-colors ${
                  i <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className="w-12 h-12 border border-primary bg-primary/10 flex items-center justify-center mb-6">
            <Icon className="w-6 h-6 text-primary" />
          </div>

          {/* Content */}
          <p
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2"
            style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
          >
            Step {String(step + 1).padStart(2, "0")} of {String(STEPS.length).padStart(2, "0")}
          </p>
          <h2
            className="text-2xl uppercase tracking-tighter mb-4"
            style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
          >
            {current.title}
          </h2>
          <p className="text-sm text-foreground/80 leading-relaxed mb-3">
            {current.body}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.detail}
          </p>

          {/* Extension download button */}
          {current.ctaAction === "extension" && (
            <a
              href="/extension.zip"
              download
              className="inline-flex items-center gap-2 mt-6 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Extension
            </a>
          )}

          {/* Platform login links */}
          {current.ctaAction === "platforms" && (
            <div className="flex flex-wrap gap-2 mt-6">
              {PLATFORM_LINKS.map((p) => (
                <a
                  key={p.name}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border border-border bg-card hover:bg-muted transition-colors"
                >
                  <img src={p.icon} alt={p.name} className="w-4 h-4 object-contain" />
                  {p.name}
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            {step > 0 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={next}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {isLast ? (
                <>
                  Get Started <Check className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
