"use client";

import { Loader2, Check, ArrowUpRight, AlertCircle, Send } from "lucide-react";

const COND = { fontFamily: "var(--font-barlow)", fontWeight: 900 } as const;
const MONO = { fontFamily: "var(--font-dm-mono), 'Courier New', monospace" } as const;

export type TicketState = "idle" | "loading" | "listed" | "error";

interface PlatformTicketProps {
  brandColor: string;
  iconPath?: string;
  monogram?: string;
  platformName: string;
  ticketCode: string;
  state: TicketState;
  isListed?: boolean;
  resolvedUrl?: string | null;
  errorMessage?: string | null;
  ctaIdle?: string;
  ctaListed?: string;
  ctaLoading?: string;
  viewLabel?: string;
  onDispatch: () => void;
  /** Hide status pill on far-right (used for one-shot non-stateful actions). */
  staticAction?: boolean;
  /** Optional inline reminder line beneath the status (e.g. "Imported — verify it's published"). */
  note?: string | null;
}

export function PlatformTicket({
  brandColor,
  iconPath,
  monogram,
  platformName,
  ticketCode,
  state,
  isListed = false,
  resolvedUrl,
  errorMessage,
  ctaIdle = "List it",
  ctaListed = "Update",
  ctaLoading = "Listing",
  viewLabel = "View listing",
  onDispatch,
  staticAction = false,
  note,
}: PlatformTicketProps) {
  const isLoading = state === "loading";
  const isError = state === "error";

  const statusLabel = isLoading
    ? "Listing…"
    : isListed
    ? "Live"
    : isError
    ? "Failed"
    : staticAction
    ? "Ready · via extension"
    : "Not listed yet";

  const dotBg = isLoading
    ? "#C28A2A"
    : isListed
    ? "var(--primary)"
    : isError
    ? "#9B2C2C"
    : "rgba(20,18,16,0.32)";

  return (
    <div className="group/ticket relative bg-background">
      {/* perforation dots along left edge — tiny editorial flourish */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-px"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(20,18,16,0.18) 1px, transparent 1.4px)",
          backgroundSize: "1px 8px",
          backgroundRepeat: "repeat-y",
        }}
      />

      <div className="flex items-stretch min-h-[104px]">
        {/* Brand color stripe — expands subtly on hover */}
        <div
          className="w-[6px] shrink-0 transition-[width] duration-300 ease-out group-hover/ticket:w-[10px]"
          style={{ background: brandColor }}
        />

        {/* Icon column */}
        <div className="flex flex-col items-center justify-center w-20 sm:w-24 shrink-0 border-r border-border bg-secondary/40">
          {iconPath ? (
            <img
              src={iconPath}
              alt=""
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
          ) : (
            <span
              className="text-base sm:text-lg uppercase tracking-tighter"
              style={{ ...COND, color: brandColor }}
            >
              {monogram ?? platformName.slice(0, 2)}
            </span>
          )}
          <span
            className="hidden sm:block mt-2 text-[8px] tracking-[0.24em] uppercase text-muted-foreground"
            style={MONO}
          >
            {ticketCode.split(" · ")[0]}
          </span>
        </div>

        {/* Identity column */}
        <div className="flex-1 flex flex-col justify-center py-4 px-5 min-w-0">
          <div className="flex items-baseline gap-3 mb-2 flex-wrap">
            <span
              className="text-lg sm:text-[22px] uppercase tracking-tighter leading-none"
              style={COND}
            >
              {platformName}
            </span>
            <span
              className="hidden md:inline-block text-[9px] uppercase tracking-[0.22em] px-1.5 py-0.5 border border-border text-muted-foreground"
              style={MONO}
            >
              {ticketCode}
            </span>
          </div>

          <div
            className="flex items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex-wrap"
            style={MONO}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`block w-1.5 h-1.5 ${isLoading ? "animate-pulse" : ""}`}
                style={{ background: dotBg }}
              />
              {statusLabel}
            </span>

            {resolvedUrl && isListed && (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4 decoration-muted-foreground/40 hover:text-foreground hover:decoration-foreground transition-colors"
              >
                {viewLabel}
                <ArrowUpRight className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          {note && (
            <div
              className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/90 italic"
              style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontStyle: "italic" }}
            >
              {note}
            </div>
          )}
        </div>

        {/* Action column */}
        <div className="flex items-center pr-3 sm:pr-5 pl-2 shrink-0">
          <button
            type="button"
            onClick={onDispatch}
            disabled={isLoading}
            style={COND}
            className={`group/btn relative inline-flex items-center gap-2 px-4 sm:px-5 py-3 text-[12px] uppercase tracking-[0.14em] border transition-all disabled:cursor-not-allowed ${
              isListed
                ? "bg-background text-foreground border-border hover:border-foreground"
                : isLoading
                ? "bg-foreground text-background border-foreground"
                : "bg-foreground text-background border-foreground hover:bg-primary hover:border-primary"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">{ctaLoading}</span>
              </>
            ) : isListed ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{ctaListed}</span>
              </>
            ) : staticAction ? (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{ctaIdle}</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">{ctaIdle}</span>
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error strip — slides in beneath the ticket */}
      {isError && errorMessage && (
        <div className="flex items-start gap-2 border-t border-border bg-foreground/[0.04] px-5 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-foreground/80" />
          <p
            className="text-[10px] uppercase tracking-[0.16em] text-foreground/80"
            style={MONO}
          >
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
