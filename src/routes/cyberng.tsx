import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  Download as DownloadIcon,
  FileArchive,
  LogOut,
  Package,
  Pencil,
  Plus,
  Send,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminDeleteZip,
  adminGetSettings,
  adminListZips,
  adminLogin,
  adminLogout,
  adminMetrics,
  adminSaveSettings,
  adminSendTelegramTest,
  adminStatus,
  adminUpsertZip,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/components/SiteLayout";

export const Route = createFileRoute("/cyberng")({
  head: () => ({
    meta: [
      { title: "Control · cyberng" },
      { name: "description", content: "Private control panel." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CyberNgPage,
});

function CyberNgPage() {
  const statusQuery = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => adminStatus(),
    staleTime: 0,
  });

  if (statusQuery.isLoading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  return statusQuery.data?.admin ? <AdminDashboard /> : <LoginScreen />;
}

function LoginScreen() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminLogin({ data: { username, password } });
      if (!res.ok) {
        setError("Wrong username or password.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-glow grid min-h-screen place-items-center px-5">
      <form onSubmit={onSubmit} className="panel neon-ring w-full max-w-sm p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold">cyberng</h1>
            <p className="text-xs text-muted-foreground">Restricted area</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <Label htmlFor="u">Username</Label>
            <Input
              id="u"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="p">Password</Label>
            <Input
              id="p"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <Button type="submit" className="mt-6 w-full" disabled={busy}>
          {busy ? "Signing in…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function AdminDashboard() {
  const qc = useQueryClient();

  const metrics = useQuery({ queryKey: ["admin", "metrics"], queryFn: () => adminMetrics() });
  const zips = useQuery({ queryKey: ["admin", "zips"], queryFn: () => adminListZips() });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminGetSettings() });

  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(
    null,
  );

  async function onLogout() {
    await adminLogout();
    await qc.invalidateQueries({ queryKey: ["admin"] });
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await adminDeleteZip({ data: { id } });
      toast.success("Deleted");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      await qc.invalidateQueries({ queryKey: ["zips"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-bold">cyberng · control</p>
              <p className="text-xs text-muted-foreground">THING.zip admin</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {/* Metrics */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total visits" value={metrics.data?.totals.visits ?? "—"} icon={Activity} />
            <StatCard
              label="Total downloads"
              value={metrics.data?.totals.downloads ?? "—"}
              icon={DownloadIcon}
            />
            <StatCard label="Zips in library" value={metrics.data?.totals.zips ?? "—"} icon={Package} />
          </div>

          <div className="panel p-5">
            <p className="mb-3 text-sm font-medium text-muted-foreground">Visits — last 7 days</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.data?.dailyVisits ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Zips CRUD */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Zips</h2>
            <Button onClick={() => setEditing({ name: "", description: "" })}>
              <Plus className="h-4 w-4" /> Add zip
            </Button>
          </div>

          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(zips.data ?? []).map((z) => (
                  <tr key={z.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <FileArchive className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium">{z.name}</p>
                          {z.description && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {z.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{formatBytes(z.size_bytes)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{z.download_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(z.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({ id: z.id, name: z.name, description: z.description ?? "" })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onDelete(z.id, z.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(zips.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No zips yet. Add your first one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Telegram + activity */}
        <section className="grid gap-6 lg:grid-cols-2">
          <TelegramCard
            initial={settings.data}
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "settings"] })}
          />

          <div className="panel p-5">
            <h2 className="text-lg font-bold">Recent visits</h2>
            <div className="mt-3 max-h-80 overflow-auto">
              <ul className="divide-y divide-border/60 text-sm">
                {(metrics.data?.recentVisits ?? []).map((v) => (
                  <li key={v.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-primary">{v.ip}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {v.path} · {v.country ?? "?"}
                    </p>
                  </li>
                ))}
                {(metrics.data?.recentVisits ?? []).length === 0 && (
                  <li className="py-6 text-center text-muted-foreground">No visits yet.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold">Recent downloads</h2>
          <div className="mt-3 max-h-72 overflow-auto">
            <ul className="divide-y divide-border/60 text-sm">
              {(metrics.data?.recentDownloads ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{d.zip_name ?? "(deleted)"}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono text-primary">{d.ip}</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
              {(metrics.data?.recentDownloads ?? []).length === 0 && (
                <li className="py-6 text-center text-muted-foreground">No downloads yet.</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      {editing && (
        <ZipDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ["admin"] });
            await qc.invalidateQueries({ queryKey: ["zips"] });
          }}
        />
      )}
    </div>
  );
}

function TelegramCard({
  initial,
  onSaved,
}: {
  initial: Awaited<ReturnType<typeof adminGetSettings>> | undefined;
  onSaved: () => void;
}) {
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (initial && !seeded.current) {
      setChatId(initial.telegram_chat_id);
      setEnabled(initial.telegram_enabled);
      seeded.current = true;
    }
  }, [initial]);

  async function save() {
    setSaving(true);
    try {
      await adminSaveSettings({ data: { telegram_chat_id: chatId.trim(), telegram_enabled: enabled } });
      toast.success("Telegram settings saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await adminSendTelegramTest();
      if (r.ok) toast.success("Test message sent");
      else toast.error(r.error ?? "Failed to send");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Telegram telemetry bot</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        When enabled, every visit and download pings your Telegram chat with the IP, country, and
        user agent.
      </p>

      {initial && !initial.telegram_configured && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          The Telegram connector is not linked to this project yet — messages will not send.
        </p>
      )}

      <div className="mt-5 space-y-3">
        <div>
          <Label htmlFor="chat">Chat ID</Label>
          <Input
            id="chat"
            placeholder="e.g. 123456789 or -100…"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="mt-1.5 font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Message your bot once, then get the chat ID from @userinfobot or from{" "}
            <span className="font-mono">/getUpdates</span>.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Send telemetry</p>
            <p className="text-xs text-muted-foreground">Turn the pings on or off.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="secondary" onClick={sendTest} disabled={testing || !chatId}>
            {testing ? "Sending…" : "Send test message"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ZipDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id?: string; name: string; description: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!initial.id && !file) {
      toast.error("Pick a zip file first");
      return;
    }
    setBusy(true);
    try {
      let payload: {
        id?: string;
        name: string;
        description: string;
        fileBase64?: string;
        fileName?: string;
      } = { name: name.trim(), description: description.trim() };
      if (initial.id) payload.id = initial.id;
      if (file) {
        const buffer = await file.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        payload = { ...payload, fileBase64: b64, fileName: file.name };
      }
      await adminUpsertZip({ data: payload });
      toast.success(initial.id ? "Zip updated" : "Zip added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit zip" : "Add zip"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="file">Zip file {initial.id && "(leave empty to keep current)"}</Label>
            <Input
              id="file"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
