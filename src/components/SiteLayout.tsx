import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Archive, KeyRound } from "lucide-react";
import { recordVisit } from "@/lib/zips.functions";

function VisitTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    void recordVisit({ data: { path: pathname } }).catch(() => undefined);
  }, [pathname]);

  return null;
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <VisitTracker />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Archive className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              THING<span className="text-primary">.zip</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              Library
            </Link>
            <Link
              to="/password"
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              activeProps={{ className: "bg-primary/25" }}
            >
              <KeyRound className="h-4 w-4" />
              What is the password?
            </Link>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-24 border-t border-border/70">
        <div className="mx-auto max-w-6xl px-5 py-10 text-sm text-muted-foreground">
          <p className="font-mono">
            Reminder: the password for every archive is{" "}
            <span className="font-bold text-primary">thing</span>.
          </p>
          <p className="mt-2 text-xs">THING.zip — a very small zip library.</p>
        </div>
      </footer>
    </div>
  );
}

export function PasswordBanner() {
  return (
    <div className="panel neon-ring overflow-hidden">
      <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Password for every single zip
          </p>
          <p className="mt-2 font-display text-4xl font-bold sm:text-5xl">
            <span className="text-muted-foreground">the password is: </span>
            <span className="text-gradient">thing</span>
          </p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-5 py-3 font-mono text-2xl font-bold text-primary">
          thing
        </div>
      </div>
      <div className="border-t border-border/70 bg-background/40 px-6 py-3 text-sm text-muted-foreground sm:px-8">
        Not <span className="font-mono text-foreground">Thing</span>, not{" "}
        <span className="font-mono text-foreground">THING</span>, not{" "}
        <span className="font-mono text-foreground">th1ng</span>. Just the lowercase word{" "}
        <span className="font-mono font-bold text-primary">thing</span> — always, for every archive
        on this site.
      </div>
    </div>
  );
}

export function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
