"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function BillingSuccessPage() {
  return (
    <Suspense>
      <BillingSuccessContent />
    </Suspense>
  );
}

function BillingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const sessionId = searchParams.get("session_id");

      // First try to sync directly from Stripe (handles missing webhook)
      const res = await fetch("/api/stripe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
      });
      if (!cancelled && res.ok) {
        const { status } = await res.json();
        if (status === "active") {
          router.push("/inventory");
          return;
        }
      }

      // Fallback: poll Supabase in case webhook arrives shortly after
      const supabase = createClient();
      let attempts = 0;
      const poll = async () => {
        if (cancelled) return;
        attempts++;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", user.id)
            .single();
          if (sub?.status === "active") {
            router.push("/inventory");
            return;
          }
        }
        if (attempts < 10) setTimeout(poll, 1000);
        else router.push("/inventory");
      };
      setTimeout(poll, 1000);
    };

    run();
    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <div className="grain-overlay min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border border-border mx-auto flex items-center justify-center">
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
            <path d="M1 8L7 14L19 1" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1
          className="text-4xl uppercase tracking-tighter"
          style={{ fontFamily: "var(--font-barlow)", fontWeight: 900 }}
        >You&apos;re all set</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Redirecting to your inventory...</p>
      </div>
    </div>
  );
}
