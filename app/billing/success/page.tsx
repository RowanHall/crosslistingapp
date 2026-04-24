"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BillingSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push("/inventory"), 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border border-black mx-auto flex items-center justify-center">
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
            <path d="M1 8L7 14L19 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-4xl font-black uppercase tracking-tighter">You&apos;re all set</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-widest">Redirecting to your inventory...</p>
      </div>
    </div>
  );
}
