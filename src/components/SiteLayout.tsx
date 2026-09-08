import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, KeyRound, Laptop, Lock } from "lucide-react";
import { recordVisit } from "@/lib/zips.functions";

/** True only for actual phones/tablets running iOS or Android. */
export function useIsPhoneOrTablet() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const iosLike = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    setBlocked(iosLike || android);
  }, []);
  return blocked;
}

export function useIsMobileDevice() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const touch = navigator.maxTouchPoints > 1;
    const ua = /Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry/i.test(navigator.userAgent);
    const ipad = /iPad|Macintosh/.test(navigator.userAgent) && touch;
    setMobile(ua || ipad || (touch && window.innerWidth < 900));
  }, []);
  return mobile;
}

function VisitTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const isRefresh = nav?.type === "reload" || nav?.type === "back_forward";
    const urlRef = new URLSearchParams(window.location.search).get("ref");
    if (urlRef) sessionStorage.setItem("thingzip-ref", urlRef);
    const ref = urlRef ?? sessionStorage.getItem("thingzip-ref");
    void recordVisit({
      data: {
        path: pathname,
        isRefresh: Boolean(isRefresh),
        screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        touch: navigator.maxTouchPoints > 0,
        ...(ref ? { ref } : {}),
      },
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}


function PhoneWall() {
  return (
    <div className="hero-glow grid min-h-screen place-items-center px-5">
      <div className="panel neon-ring w-full max-w-md p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Laptop className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold">Computer only</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          THING.zip only works on a computer. Every archive here is password protected, and phones
          and tablets cannot open a password-protected zip — so viewing, sharing and downloading are
          all limited to desktop.
        </p>
        <div className="mt-6 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            the password is always
          </p>
          <p className="mt-1 font-display text-4xl font-bold text-primary">thing</p>
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Open this page on a PC or Mac to continue.
        </p>
      </div>
    </div>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const blocked = useIsPhoneOrTablet();

  if (blocked) {
    return (
      <>
        <VisitTracker />
        <PhoneWall />
      </>
    );
  }

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
            Password for every archive:{" "}
            <span className="font-bold text-primary">thing</span>.
          </p>
          <p className="mt-2 text-xs">THING.zip</p>
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
