import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/auth/actions";

export async function Navbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tighter uppercase">
            X-LIST
          </Link>
          {user && (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium tracking-wide">
              <Link href="/inventory" className="hover:text-muted-foreground transition-colors">
                INVENTORY
              </Link>
              <Link href="/analytics" className="hover:text-muted-foreground transition-colors">
                ANALYTICS
              </Link>
              <Link href="/account" className="hover:text-muted-foreground transition-colors">
                ACCOUNT
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <form action={signOut}>
                <Button variant="ghost" className="text-xs font-medium uppercase tracking-wider hover:bg-transparent hover:text-muted-foreground">
                  Logout
                </Button>
              </form>
              <Button asChild className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90 hover:invert border border-transparent hover:border-primary transition-all duration-200 font-medium tracking-wide">
                <Link href="/listing/new">NEW LISTING</Link>
              </Button>
            </>
          ) : (
             <Button asChild className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90 hover:invert border border-transparent hover:border-primary transition-all duration-200 font-medium tracking-wide">
                <Link href="/login">LOGIN</Link>
              </Button>
          )}
        </div>
      </div>
    </header>
  );
}
