/**
 * Camp Pass + stage-aware story export. Presentation only.
 * The exported image never carries booking IDs, prices, passport or TM30 data —
 * just first name, stage line, day count and the camp mark.
 */
import { useEffect, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

type Stage = "upcoming" | "active" | "completed";

function stageOf(b: any): Stage | null {
  if (!b) return null;
  if (b.state === "checked_in") return "active";
  if (b.state === "completed") return "completed";
  if (["confirmed", "pending_deposit", "soft_hold"].includes(b.state)) return "upcoming";
  return null;
}

function lines(b: any, stage: Stage) {
  const ci = new Date(b.check_in), co = new Date(b.check_out);
  const total = Math.max(1, differenceInCalendarDays(co, ci));
  if (stage === "upcoming") {
    const d = Math.max(0, differenceInCalendarDays(ci, new Date()));
    return { kicker: "CAMP PASS // BOOKED", big: `${String(d).padStart(2, "0")} DAYS`, sub: "TO CANVAS", stamp: "BOOKED & DISPATCHED" };
  }
  if (stage === "active") {
    const day = Math.min(total, Math.max(1, differenceInCalendarDays(new Date(), ci) + 1));
    return { kicker: "FIGHT CAMP IN SESSION", big: `DAY ${day}`, sub: `OF ${total}`, stamp: "PUTTING THE WORK IN" };
  }
  return { kicker: "CAMP COMPLETED", big: `${total} DAYS`, sub: "CLEARED", stamp: "OFFICIALLY CLEARED" };
}

async function renderStory(name: string, l: ReturnType<typeof lines>): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1920;
  const x = c.getContext("2d")!;
  const ink = "#2a2420", gold = "#b8924a", canvas = "#efe6d6", red = "#9c3b2e";
  x.fillStyle = canvas; x.fillRect(0, 0, 1080, 1920);
  x.strokeStyle = gold; x.lineWidth = 14; x.strokeRect(60, 60, 960, 1800);
  x.lineWidth = 3; x.strokeRect(90, 90, 900, 1740);
  x.fillStyle = ink; x.textAlign = "center";
  x.font = "600 44px ui-monospace, monospace"; x.fillText("LAMAI MUAY THAI // KOH SAMUI", 540, 260);
  x.fillStyle = gold; x.font = "700 56px ui-monospace, monospace"; x.fillText(l.kicker, 540, 520);
  x.fillStyle = ink; x.font = "800 220px Georgia, serif"; x.fillText(l.big, 540, 860);
  x.font = "600 72px ui-monospace, monospace"; x.fillText(l.sub, 540, 980);
  x.font = "italic 64px Georgia, serif"; x.fillText(name.toUpperCase(), 540, 1180);
  x.save(); x.translate(540, 1480); x.rotate(-0.08);
  x.strokeStyle = red; x.fillStyle = red; x.lineWidth = 8; x.strokeRect(-380, -80, 760, 160);
  x.font = "800 58px ui-monospace, monospace"; x.textBaseline = "middle"; x.fillText(l.stamp, 0, 0);
  x.restore();
  x.fillStyle = ink; x.globalAlpha = 0.6; x.font = "500 36px ui-monospace, monospace";
  x.fillText("CAMPSTAY LMT", 540, 1760);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

export function CampPass({ booking, guestName }: { booking: any | null; guestName?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  // Admin "view as guest" preview locks every control via a disabled fieldset.
  // Export story mutates nothing (pure client-side canvas), so it stays tappable
  // there too — rendered as a non-form control the fieldset can't disable.
  const previewLocked = searchParams.has("as");
  const stage = stageOf(booking);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const set = (px: number) => el.style.setProperty("--sheen", `${Math.round(px * 100)}%`);
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
    const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma != null) set((e.gamma + 45) / 90); };
    el.addEventListener("pointermove", onMove);
    window.addEventListener("deviceorientation", onTilt);
    return () => { el.removeEventListener("pointermove", onMove); window.removeEventListener("deviceorientation", onTilt); };
  }, [stage]);

  if (!stage) return null;
  const first = (guestName || "Fighter").trim().split(/\s+/)[0];
  const l = lines(booking, stage);

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderStory(first, l);
      const file = new File([blob], "lmt-camp-pass.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Lamai Muay Thai" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.success("Saved — post it wherever you like");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Couldn't make the image");
    } finally { setBusy(false); }
  };

  return (
    <section ref={ref} className="camp-pass-foil" aria-label="Camp pass">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-80">{l.kicker}</p>
          <p className="text-3xl font-bold leading-none mt-2" style={{ fontFamily: "'Playfair Display', serif" }}>{l.big}</p>
          <p className="text-xs font-mono uppercase tracking-widest mt-1 opacity-80">{l.sub}</p>
          <p className="text-sm mt-3 truncate">{first} · {booking.units?.name ?? "Lamai"}</p>
        </div>
        <span className="camp-pass-stamp shrink-0">LMT</span>
      </div>
      <Button size="sm" variant="secondary" className="mt-4 w-full sm:w-auto" onClick={share} disabled={busy}>
        <Share2 className="h-4 w-4 mr-1.5" /> {busy ? "Printing…" : "Export story"}
      </Button>
    </section>
  );
}
