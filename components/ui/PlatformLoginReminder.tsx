"use client";

import { useState } from "react";
import { AlertTriangle, X, ExternalLink } from "lucide-react";

const PLATFORMS = [
  { name: "Facebook", url: "https://www.facebook.com/marketplace", icon: "/platforms/facebook2.svg" },
  { name: "Grailed", url: "https://www.grailed.com", icon: "/platforms/grailed.png" },
  { name: "Depop", url: "https://www.depop.com", icon: "/platforms/depop.png" },
  { name: "eBay", url: "https://www.ebay.com", icon: "/platforms/ebay.png" },
];

export function PlatformLoginReminder({ compact = false }: { compact?: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (compact) {
    return (
      <div className="flex items-start gap-2 p-2 border border-border bg-card text-[10px] uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
        <span>
          Make sure you're <strong className="text-foreground">logged in</strong> to each platform in another tab
        </span>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
          <p
            className="text-xs font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
          >
            Stay logged in
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        The extension captures your sessions from open tabs. Make sure you're logged into each platform you want to sync or crosslist to.
      </p>

      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <a
            key={p.name}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border border-border bg-background hover:bg-muted transition-colors"
          >
            <img src={p.icon} alt={p.name} className="w-3.5 h-3.5 object-contain" />
            {p.name}
            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}
