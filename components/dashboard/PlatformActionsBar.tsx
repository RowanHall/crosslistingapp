"use client";

import { useDepopSync } from "@/hooks/useDepopSync";
import { useGrailedSync } from "@/hooks/useGrailedSync";
import { useFacebookSync } from "@/hooks/useFacebookSync";
import { Loader2, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PLATFORMS = {
  depop:    { label: "Depop",    color: "#FF2300" },
  grailed:  { label: "Grailed",  color: "#161616" },
  facebook: { label: "Facebook", color: "#1877F2" },
} as const;

type Platform = keyof typeof PLATFORMS;

// ─── Unified Sync Button ─────────────────────────────────────────────────────

function SyncButton() {
  const depop    = useDepopSync();
  const grailed  = useGrailedSync();
  const facebook = useFacebookSync();

  const [open, setOpen]   = useState(false);
  const [picks, setPicks] = useState<Set<Platform>>(new Set(["depop", "grailed", "facebook"]));
  const dropdownRef       = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isAnySyncing = depop.isSyncing || grailed.isSyncing || facebook.isSyncing;

  const togglePick = (p: Platform) =>
    setPicks((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  const startSelected = () => {
    setOpen(false);
    if (picks.has("depop"))    depop.startSync();
    if (picks.has("grailed"))  grailed.startSync();
    if (picks.has("facebook")) facebook.startSync();
  };

  // Per-platform status lines
  const statuses: { platform: Platform; status: string | null; isSyncing: boolean }[] = [
    { platform: "depop",    status: depop.syncStatus,    isSyncing: depop.isSyncing },
    { platform: "grailed",  status: grailed.syncStatus,  isSyncing: grailed.isSyncing },
    { platform: "facebook", status: facebook.syncStatus, isSyncing: facebook.isSyncing },
  ];

  // Progress for platforms that support it
  const grailedPct = grailed.progress?.total
    ? Math.round((grailed.progress.current / grailed.progress.total) * 100)
    : grailed.progress?.phase === "fetching" ? 5 : 0;

  const facebookPct = facebook.progress?.total
    ? Math.round((facebook.progress.current / facebook.progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-1" ref={dropdownRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isAnySyncing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAnySyncing ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Syncing…</>
        ) : (
          <>Sync <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} /></>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-2 z-50 bg-card border border-border shadow-md p-3 min-w-[160px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Sync from:
          </p>
          <div className="flex flex-col gap-1.5 mb-3">
            {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 transition-colors ${picks.has(p) ? "bg-primary border-primary" : "bg-background border-border"}`}
                  onClick={() => togglePick(p)}
                >
                  {picks.has(p) && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PLATFORMS[p].color }}
                  />
                  {PLATFORMS[p].label}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={startSelected}
            disabled={picks.size === 0}
            className="w-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Sync Now
          </button>
        </div>
      )}

      {/* Per-platform progress / status */}
      {(depop.isSyncing || grailed.isSyncing || facebook.isSyncing) && (
        <div className="flex flex-col gap-1 mt-1">
          {grailed.isSyncing && grailed.progress && (
            <div className="w-36">
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">Grailed</span>
                <span className="text-[10px] font-mono">{grailedPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted border border-border overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${grailedPct}%` }} />
              </div>
            </div>
          )}
          {facebook.isSyncing && facebook.progress && (
            <div className="w-36">
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">Facebook</span>
                {facebook.progress.total > 0 && (
                  <span className="text-[10px] font-mono">{facebookPct}%</span>
                )}
              </div>
              <div className="w-full h-1.5 bg-muted border border-border overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: facebook.progress.total > 0 ? `${facebookPct}%` : "100%",
                  }}
                />
              </div>
            </div>
          )}
          {depop.isSyncing && (
            <div className="flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-bold uppercase">Depop syncing…</span>
            </div>
          )}
        </div>
      )}

      {/* Completion toasts */}
      {!isAnySyncing && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {statuses.map(({ platform, status }) =>
            status ? (
              <div key={platform} className="flex items-center gap-1">
                {status.startsWith("Success") ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  {PLATFORMS[platform].label}: {status}
                </span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export function PlatformActionsBar() {
  return (
    <div className="relative">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        Sync From
      </p>
      <SyncButton />
    </div>
  );
}
