import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "THING.zip has moved" },
      {
        name: "description",
        content: "THING.zip has moved to a new home.",
      },
      { property: "og:title", content: "THING.zip has moved" },
      {
        property: "og:description",
        content: "THING.zip has moved to a new home.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { httpEquiv: "refresh", content: "5;url=https://teentube.store/" },
    ],
  }),
  component: MovedPage,
});

function MovedPage() {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = "https://teentube.store/";
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hero-glow grid min-h-screen place-items-center px-5">
      <div className="panel neon-ring w-full max-w-lg p-8 text-center sm:p-10">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          THING.zip has moved
        </h1>
        <p className="mt-4 text-muted-foreground">
          This library is now hosted at a new address. You will be redirected automatically in a few seconds.
        </p>
        <a
          href="https://teentube.store/"
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to the new site
          <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          https://teentube.store/
        </p>
      </div>
    </div>
  );
}
