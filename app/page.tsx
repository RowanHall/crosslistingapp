"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

/* ─── Data ─────────────────────────────────────────────────────────── */

const PLATFORMS = [
  { name: "Facebook Marketplace", short: "FB MKT" },
  { name: "Grailed", short: "GRAILED" },
  { name: "eBay", short: "EBAY" },
  { name: "Depop", short: "DEPOP" },
];

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Import your inventory",
    body: "Connect existing listings from any platform. Our browser extension scrapes and imports everything in one click.",
  },
  {
    n: "02",
    title: "One-click crosslist",
    body: "Select a listing and push it to every platform simultaneously. No copy-pasting, no reformatting.",
  },
  {
    n: "03",
    title: "Sell more",
    body: "More platforms means more eyeballs. Reach every buyer, on every marketplace, at the same time.",
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

/* ─── Design tokens ─────────────────────────────────────────────────── */

const C = {
  bg: "#EDE7DB", // warm parchment
  bgDark: "#E2DACC", // slightly deeper parchment
  text: "#141210", // espresso near-black
  accent: "#2D6A4F", // Forest green
  muted: "rgba(20,18,16,0.42)",
  border: "rgba(20,18,16,0.11)",
  patch: "#D9D1C4", // label patch background
};

// Font stacks — CSS variables set by next/font in layout.tsx
const COND = "var(--font-barlow), 'Arial Narrow', sans-serif";
const SERIF = "var(--font-cormorant), Georgia, serif";
const MONO = "var(--font-dm-mono), 'Courier New', monospace";

/* ─── Component ─────────────────────────────────────────────────────── */

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .single();
        setIsActive(data?.status === "active");
      }
      setUserChecked(true);
    });
  }, []);

  // Auto-trigger checkout after returning from magic-link login
  useEffect(() => {
    if (!userChecked) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "true" && user) {
      window.history.replaceState({}, "", "/");
      handleSubscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userChecked]);

  async function handleSubscribe() {
    if (!user) {
      router.push("/login?returnTo=purchase");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="grain-overlay"
      style={{
        background: C.bg,
        color: C.text,
        minHeight: "100vh",
        fontFamily: COND,
      }}
    >
      {/* ══ NAV ══════════════════════════════════════════════════════════ */}
      <header
        className="site-header"
        style={{
          borderBottom: `1px solid ${C.border}`,
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: C.bg,
          zIndex: 50,
        }}
      >
        <span
          style={{
            fontFamily: COND,
            fontWeight: 900,
            fontSize: "24px",
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            color: C.accent,
            position: "relative",
            display: "inline-block",
          }}
        >
          {/* Blurred layer visible on right side */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              filter: "blur(1.2px)",
              opacity: 0.35,
              color: C.accent,
            }}
          >
            CROSSLIST
          </span>
          {/* Sharp layer that fades out left-to-right */}
          <span
            style={{
              position: "relative",
              maskImage: "linear-gradient(to right, black 50%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 50%, transparent 100%)",
            }}
          >
            CROSSLIST
          </span>
        </span>

        <nav style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <a
            href="#pricing"
            className="nav-pricing"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: C.muted,
              textDecoration: "none",
              transition: "color 0.18s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
          >
            Pricing
          </a>
          <a
            href={user ? "/inventory" : "/login"}
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: C.text,
              textDecoration: "none",
              border: `1px solid ${C.border}`,
              padding: "7px 16px",
              transition: "background 0.18s, color 0.18s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C.text;
              e.currentTarget.style.color = C.bg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = C.text;
            }}
          >
            {userChecked ? (user ? "Dashboard" : "Log In") : ""}
          </a>
        </nav>
      </header>

      {/* ══ HERO ═════════════════════════════════════════════════════════ */}
      <section className="hero-section">
        {/* Top content group */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            maxWidth: "900px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          <p
            className="fade-up-1"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: "36px",
            }}
          >
            The reseller&apos;s shortcut
          </p>

          <h1
            className="fade-up-2"
            style={{
              fontFamily: COND,
              fontWeight: 900,
              textTransform: "uppercase",
              fontSize: "clamp(72px, 15vw, 180px)",
              lineHeight: 0.87,
              letterSpacing: "-0.01em",
              marginBottom: "56px",
              textAlign: "center",
            }}
          >
            List
            <br />
            once.
            <br />
            <span style={{ fontStyle: "italic", color: C.accent }}>Sell</span>
            <br />
            everywhere.
          </h1>

          <div
            className="fade-up-3"
            style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <p
              style={{
                fontFamily: MONO,
                fontSize: "13px",
                color: C.muted,
                lineHeight: 1.75,
                maxWidth: "380px",
                marginBottom: "44px",
                textAlign: "center",
              }}
            >
              Push any listing to Facebook Marketplace, Grailed, eBay, and Depop simultaneously —
              from one inventory dashboard.
            </p>
            <div className="hero-cta-row" style={{ justifyContent: "center" }}>
              <button
                className="hero-cta-btn"
                onClick={isActive ? () => router.push("/inventory") : handleSubscribe}
                disabled={busy}
                style={{
                  background: C.accent,
                  color: "#fff",
                  border: "none",
                  padding: "16px 40px",
                  fontFamily: COND,
                  fontWeight: 700,
                  fontSize: "14px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.65 : 1,
                  transition: "opacity 0.18s, transform 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!busy) e.currentTarget.style.opacity = "0.82";
                }}
                onMouseLeave={(e) => {
                  if (!busy) e.currentTarget.style.opacity = "1";
                }}
              >
                {busy ? "Loading..." : isActive ? "Manage Inventory" : "Get Started — $19.99/mo"}
              </button>
              {userChecked && !isActive && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "10px",
                    color: C.muted,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Cancel anytime
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        {userChecked && !isActive && (
          <div className="hero-stats fade-up-4" style={{ justifyContent: "center" }}>
            {[
              ["04", "Platforms"],
              ["$19.99/mo", "Per month"],
              ["∞", "Listings"],
              ["1-click", "Crosslist"],
            ].map(([val, label]) => (
              <div key={label} className="hero-stat-item" style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: COND,
                    fontWeight: 900,
                    fontSize: "28px",
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {val}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: "9px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: C.muted,
                    marginTop: "4px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ PLATFORM PATCHES ════════════════════════════════════════════ */}
      <section
        style={{
          padding: "clamp(36px, 5vh, 56px) clamp(20px, 5vw, 48px)",
          borderBottom: `1px solid ${C.border}`,
          background: C.bgDark,
        }}
      >
        <p
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          Cross-post to every major resale platform
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" }}>
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              style={{
                background: C.patch,
                border: `1px solid ${C.border}`,
                padding: "9px 20px",
                fontFamily: COND,
                fontWeight: 800,
                fontSize: "13px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.text,
              }}
            >
              {p.name}
            </div>
          ))}
          <div
            style={{
              background: "transparent",
              border: `1px dashed ${C.border}`,
              padding: "9px 20px",
              fontFamily: COND,
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.muted,
            }}
          >
            + More coming
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section
        className="content-section"
        style={{
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ marginBottom: "64px", textAlign: "center" }}>
            <p
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: C.accent,
                marginBottom: "12px",
              }}
            >
              How it works
            </p>
            <h2
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: "clamp(36px, 4.5vw, 56px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Three steps to everywhere.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {HOW_IT_WORKS.map((item, i) => (
              <div
                key={item.n}
                className="step-grid-item"
                style={{
                  padding: "40px",
                  paddingLeft: i === 0 ? 0 : "40px",
                  borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: COND,
                    fontWeight: 900,
                    fontSize: "72px",
                    lineHeight: 1,
                    color: "rgba(20,18,16,0.07)",
                    letterSpacing: "-0.02em",
                    display: "block",
                    userSelect: "none",
                  }}
                >
                  {item.n}
                </span>
                <div
                  style={{ width: "24px", height: "2px", background: C.accent, margin: "16px 0" }}
                />
                <h3
                  style={{
                    fontFamily: COND,
                    fontWeight: 800,
                    fontSize: "20px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontFamily: MONO, fontSize: "12px", color: C.muted, lineHeight: 1.75 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ MANIFESTO ═══════════════════════════════════════════════════ */}
      <section
        className="content-section"
        style={{
          borderBottom: `1px solid ${C.border}`,
          background: C.bgDark,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Large background word */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: "-32px",
            right: "-16px",
            fontFamily: COND,
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: "clamp(160px, 22vw, 280px)",
            textTransform: "uppercase",
            color: "rgba(20,18,16,0.04)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            userSelect: "none",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          SOLD
        </div>

        <div
          style={{
            maxWidth: "860px",
            position: "relative",
            zIndex: 1,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: "36px",
            }}
          >
            The case for crosslisting
          </p>
          <blockquote
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(28px, 3.6vw, 48px)",
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              marginBottom: "52px",
            }}
          >
            &ldquo;Most resellers list on one platform and wonder why their items sit. Crosslist
            changes the math — list once, reach everyone.&rdquo;
          </blockquote>

          <p
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              color: C.muted,
              lineHeight: 1.8,
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            Built for resellers who move volume — whether you&apos;re flipping streetwear on
            Grailed, vintage on eBay, or everyday items on Facebook Marketplace. One dashboard,
            every platform, zero copy-pasting.
          </p>
        </div>
      </section>

      {/* ══ PRICING ══════════════════════════════════════════════════════ */}
      {userChecked && !isActive && (
        <section id="pricing" className="content-section">
          <div style={{ maxWidth: "520px", margin: "0 auto" }}>
            <p
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: C.accent,
                marginBottom: "10px",
                textAlign: "center",
              }}
            >
              Pricing
            </p>
            <h2
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: "clamp(38px, 5vw, 58px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                textAlign: "center",
                marginBottom: "52px",
              }}
            >
              Simple. One plan.
            </h2>

            {/* Price tag card */}
            <div
              className="pricing-card"
              style={{
                background: C.bgDark,
                border: `1px solid ${C.border}`,
                padding: "52px",
                position: "relative",
              }}
            >
              {/* Tag hole */}
              <div
                style={{
                  position: "absolute",
                  top: "22px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border: `1.5px solid rgba(20,18,16,0.18)`,
                  background: C.bg,
                }}
              />

              {/* Price */}
              <div style={{ marginTop: "12px", marginBottom: "36px", textAlign: "center" }}>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: "9px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: C.muted,
                    marginBottom: "6px",
                  }}
                >
                  Monthly plan
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: COND,
                      fontWeight: 900,
                      fontSize: "88px",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    $19.99
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: "10px",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: C.muted,
                    }}
                  >
                    / mo
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: "32px" }} />

              {/* Features */}
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 40px 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {FEATURES.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      fontFamily: MONO,
                      fontSize: "12px",
                      color: C.muted,
                    }}
                  >
                    <span
                      style={{
                        color: C.accent,
                        fontWeight: 700,
                        fontSize: "14px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={handleSubscribe}
                disabled={busy}
                style={{
                  width: "100%",
                  background: C.accent,
                  color: "#fff",
                  border: "none",
                  padding: "18px",
                  fontFamily: COND,
                  fontWeight: 800,
                  fontSize: "15px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.65 : 1,
                  transition: "opacity 0.18s",
                }}
                onMouseEnter={(e) => {
                  if (!busy) e.currentTarget.style.opacity = "0.82";
                }}
                onMouseLeave={(e) => {
                  if (!busy) e.currentTarget.style.opacity = "1";
                }}
              >
                {busy ? "Loading..." : "Subscribe Now"}
              </button>

              <p
                style={{
                  fontFamily: MONO,
                  fontSize: "9px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: C.muted,
                  textAlign: "center",
                  marginTop: "16px",
                }}
              >
                Cancel anytime · Billing by Stripe
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: `28px clamp(20px, 5vw, 48px)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.bgDark,
        }}
      >
        <span
          style={{
            fontFamily: COND,
            fontWeight: 900,
            fontSize: "24px",
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            color: "#EDE7DB",
            background: C.accent,
            borderRadius: "6px",
            padding: "2px 6px",
            display: "inline-block",
            position: "relative",
          }}
        >
          <span aria-hidden style={{
            position: "absolute",
            inset: 0,
            filter: "blur(1.2px)",
            opacity: 0.35,
            color: "#EDE7DB",
            padding: "4px 8px",
          }}>CL</span>
          <span style={{
            position: "relative",
            maskImage: "linear-gradient(to right, black 50%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, black 50%, transparent 100%)",
          }}>CL</span>
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.muted,
          }}
        >
          © {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
