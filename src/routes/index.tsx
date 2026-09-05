import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileArchive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listZips, requestDownload } from "@/lib/zips.functions";
import { SiteLayout, PasswordBanner, formatBytes } from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";

const zipsQuery = queryOptions({
  queryKey: ["zips"],
  queryFn: () => listZips(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(zipsQuery),
  head: () => ({
    meta: [
      { title: "THING.zip — Free Zip Library (password: thing)" },
      {
        name: "description",
        content:
          "Browse and download archives from the THING.zip library. Every zip uses the same password: thing.",
      },
      { property: "og:title", content: "THING.zip — Free Zip Library" },
      {
        property: "og:description",
        content: "Download archives freely. The password for every zip is always: thing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: zips } = useSuspenseQuery(zipsQuery);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(id: string, name: string) {
    setBusy(id);
    try {
      const { url } = await requestDownload({ data: { id } });
      window.location.href = url;
      toast.success(`Downloading ${name}`, { description: "Password to extract: thing" });
    } catch {
      toast.error("That download could not be started");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SiteLayout>
      <section className="hero-glow">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-10 sm:pt-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            zip library
          </p>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] sm:text-7xl">
            Grab a zip.
            <br />
            <span className="text-gradient">The password is thing.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Everything here is packed into a password-protected archive. There is only one password
            and it never changes.
          </p>

          <div className="mt-10">
            <PasswordBanner />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">Archives</h2>
          <span className="font-mono text-sm text-muted-foreground">
            {zips.length} {zips.length === 1 ? "file" : "files"}
          </span>
        </div>

        {zips.length === 0 ? (
          <div className="panel mt-6 grid place-items-center gap-2 p-16 text-center">
            <FileArchive className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">The shelf is empty right now</p>
            <p className="text-sm text-muted-foreground">
              New archives will show up here as soon as they are added.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {zips.map((zip) => (
              <article
                key={zip.id}
                className="panel flex flex-col gap-4 p-5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                    <FileArchive className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{zip.name}</h3>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatBytes(zip.size_bytes)} · {zip.download_count} downloads
                    </p>
                  </div>
                </div>

                {zip.description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{zip.description}</p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
                    pw: thing
                  </span>
                  <Button
                    size="sm"
                    onClick={() => void download(zip.id, zip.name)}
                    disabled={busy === zip.id}
                  >
                    {busy === zip.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
