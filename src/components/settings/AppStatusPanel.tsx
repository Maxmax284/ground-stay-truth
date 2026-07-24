import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, Smartphone, Info } from "lucide-react";

// Baked at build time in vite.config.ts
declare const __APP_BUILD_DATE__: string;

const EXPECTED_START_URL = "/index";
const EXPECTED_ID = "/index";
const INSTALL_STAMP_KEY = "lmt-campstay:install-stamp";

type ManifestSnapshot = {
  name?: string;
  short_name?: string;
  start_url?: string;
  id?: string;
  scope?: string;
};

export function AppStatusPanel() {
  const [manifest, setManifest] = useState<ManifestSnapshot | null>(null);
  const [swState, setSwState] = useState<"unsupported" | "none" | "installing" | "waiting" | "active">("none");
  const [swScriptUrl, setSwScriptUrl] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [installStamp, setInstallStamp] = useState<string | null>(null);

  const loadStatus = async () => {
    setChecking(true);
    try {
      // Manifest
      try {
        const res = await fetch("/manifest.webmanifest", { cache: "no-cache" });
        if (res.ok) setManifest(await res.json());
      } catch {
        /* noop */
      }

      // Standalone detection
      setStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as any).standalone === true,
      );

      // Install stamp
      setInstallStamp(localStorage.getItem(INSTALL_STAMP_KEY));

      // Service worker
      if (!("serviceWorker" in navigator)) {
        setSwState("unsupported");
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          setSwState("none");
        } else {
          const worker = reg.active ?? reg.waiting ?? reg.installing;
          setSwScriptUrl(worker?.scriptURL ?? null);
          if (reg.installing) setSwState("installing");
          else if (reg.waiting) setSwState("waiting");
          else if (reg.active) setSwState("active");
          else setSwState("none");
        }
      }
      setLastChecked(new Date());
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const forceUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      await loadStatus();
    } finally {
      setChecking(false);
    }
  };

  const identityOk =
    manifest?.start_url === EXPECTED_START_URL && manifest?.id === EXPECTED_ID;
  const stampOk = !standalone || !installStamp || installStamp === EXPECTED_START_URL;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          App & PWA Status
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Confirm this device is running the current LMT CampStay install target and service worker.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Row label="App name" value={manifest?.name ?? "—"} />
          <Row label="Short name" value={manifest?.short_name ?? "—"} />
          <Row
            label="Start URL"
            value={manifest?.start_url ?? "—"}
            status={identityOk ? "ok" : "warn"}
          />
          <Row label="Manifest ID" value={manifest?.id ?? "—"} status={identityOk ? "ok" : "warn"} />
          <Row label="Scope" value={manifest?.scope ?? "—"} />
          <Row label="Build" value={typeof __APP_BUILD_DATE__ !== "undefined" ? __APP_BUILD_DATE__ : "—"} />
          <Row
            label="Running as installed app"
            value={standalone ? "Yes" : "No (browser tab)"}
            status={standalone ? "ok" : "info"}
          />
          <Row
            label="Service worker"
            value={
              swState === "active"
                ? "Active"
                : swState === "waiting"
                ? "Update waiting — will apply on next launch"
                : swState === "installing"
                ? "Installing…"
                : swState === "unsupported"
                ? "Not supported on this browser"
                : "Not registered"
            }
            status={
              swState === "active"
                ? "ok"
                : swState === "waiting" || swState === "installing"
                ? "info"
                : "warn"
            }
          />
          {swScriptUrl && (
            <Row
              label="SW script"
              value={new URL(swScriptUrl).pathname}
            />
          )}
          <Row
            label="Last checked"
            value={lastChecked ? lastChecked.toLocaleTimeString() : "—"}
          />
        </div>

        {!identityOk && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-foreground">
              Manifest start URL doesn't match the current CampStay target ({EXPECTED_START_URL}). If you're
              seeing the public accommodation page when launching the installed app, delete the old icon and
              reinstall from lmtcampstay.com.
            </p>
          </div>
        )}

        {!stampOk && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-foreground">
              This installed app was captured before the latest CampStay update. Remove it from your home
              screen and reinstall once — future updates will flow through automatically after that.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={loadStatus} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={forceUpdate} disabled={checking || swState === "unsupported"}>
            Check for service worker update
          </Button>
        </div>

        <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            Normal updates apply automatically the next time you open the app. A reinstall is only needed
            when the start URL or app identity itself changed (rare).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: "ok" | "warn" | "info";
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-card/60 p-2.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex items-center gap-1.5 text-right text-xs font-medium text-foreground break-all">
        {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />}
        {status === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
        {value}
      </span>
    </div>
  );
}

// Exported for reuse by ReinstallPrompt
export const PWA_INSTALL_STAMP_KEY = INSTALL_STAMP_KEY;
export const PWA_EXPECTED_START_URL = EXPECTED_START_URL;
