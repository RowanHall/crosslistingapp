import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage(props: {
  searchParams: Promise<{ message?: string; returnTo?: string }>;
}) {
  const searchParams = await props.searchParams;
  const message = searchParams.message;
  const returnTo = searchParams.returnTo;

  const signIn = async (formData: FormData) => {
    "use server";

    const email = formData.get("email") as string;
    const supabase = await createClient();

    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const callbackUrl = returnTo
      ? `${base}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
      : `${base}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      return redirect("/login?message=Could not authenticate user");
    }

    return redirect("/login?message=Check your email for the magic link");
  };

  return (
    <div className="grain-overlay min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-none border border-border shadow-none bg-card">
        <CardHeader className="text-center space-y-2">
          <span
            className="text-2xl uppercase text-primary relative inline-block"
            style={{ fontFamily: "var(--font-barlow)", fontWeight: 900, letterSpacing: "-0.03em" }}
          >
            <span className="absolute inset-0 blur-[1.2px] opacity-35" aria-hidden>CROSSLIST</span>
            <span className="relative" style={{
              maskImage: "linear-gradient(to right, black 50%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 50%, transparent 100%)",
            }}>CROSSLIST</span>
          </span>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Enter your email to continue
          </p>
        </CardHeader>
        <CardContent>
          <form action={signIn} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="sr-only">Email</Label>
              <Input
                name="email"
                placeholder="EMAIL@EXAMPLE.COM"
                required
                className="rounded-none border-border h-12 text-lg font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0 bg-background"
              />
            </div>
            
            <Button className="w-full rounded-none bg-primary text-primary-foreground hover:opacity-90 h-12 text-sm font-bold tracking-widest uppercase transition-all">
              Send Magic Link
            </Button>

            {message && (
              <p className="text-center text-xs font-mono bg-muted p-2 border border-border">
                {message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
