import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { SiteLayout, PasswordBanner } from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/password")({
  head: () => ({
    meta: [
      { title: "What is the password? — THING.zip" },
      {
        name: "description",
        content: "The password for every zip in the THING.zip library is: thing. It never changes.",
      },
      { property: "og:title", content: "What is the password? — THING.zip" },
      {
        property: "og:description",
        content: "The password for every zip on THING.zip is: thing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PasswordPage,
});

const wrong = ["Thing", "THING", "th1ng", "thing123", "password"];

function PasswordPage() {
  return (
    <SiteLayout>
      <section className="hero-glow">
        <div className="mx-auto max-w-4xl px-5 pt-16 pb-10 sm:pt-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            frequently, constantly asked
          </p>
          <h1 className="mt-4 text-5xl font-bold sm:text-6xl">What is the password?</h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Short answer: it is the word <span className="font-mono text-primary">thing</span>.
          </p>

          <div className="mt-10">
            <PasswordBanner />
          </div>

          <div className="panel mt-6 p-6 sm:p-8">
            <h2 className="text-xl font-bold">The long answer</h2>
            <p className="mt-3 text-muted-foreground">
              Every single archive on this site — past, present and future — is protected with the
              exact same password. There is no per-file password, no email unlock, no survey, and no
              link shortener. When your unzip tool asks for a password, type:
            </p>
            <p className="mt-5 rounded-xl border border-primary/40 bg-primary/10 px-6 py-5 text-center font-mono text-3xl font-bold text-primary">
              thing
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Correct
                </h3>
                <p className="mt-3 flex items-center gap-2 font-mono text-lg">
                  <Check className="h-5 w-5 text-primary" /> thing
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Not the password
                </h3>
                <ul className="mt-3 space-y-1.5">
                  {wrong.map((w) => (
                    <li key={w} className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                      <X className="h-4 w-4 text-destructive" /> {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/">Back to the library</Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
