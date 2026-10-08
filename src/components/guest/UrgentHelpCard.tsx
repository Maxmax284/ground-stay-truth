import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, MessageCircle, Siren, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  URGENT_CATEGORIES, useAssistanceConfig, useCreateUrgentRequest, useMyOpenUrgentRequest,
} from "@/hooks/useUrgentAssistance";

import { toTelLink, toWaLink } from "@/lib/contactLinks";
const tel = (n: string) => toTelLink(n)!;
const wa = (n: string) => toWaLink(n)!;

/**
 * Guest "Need help?" card. Three separate routes (call / CampStay message /
 * existing WhatsApp) plus an optional urgent request. Never promises a response.
 * Adds to — never replaces — the existing Stay Essentials emergency contact.
 */
export function UrgentHelpCard({ bookingId }: { bookingId: string | null }) {
  const { data: cfg } = useAssistanceConfig();
  const { data: openReq } = useMyOpenUrgentRequest(bookingId);
  const create = useCreateUrgentRequest();
  const [category, setCategory] = useState<string>("__none__");
  const [details, setDetails] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (!cfg) return null;
  const hasAnything = cfg.urgent_call_number || cfg.whatsapp_display_number || cfg.urgent_requests_enabled;
  if (!hasAnything) return null;

  const openMessages = () =>
    window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "messages" } }));

  const submit = async () => {
    if (!bookingId || category === "__none__") return;
    try {
      const r = await create.mutateAsync({ bookingId, category, details });
      toast.success(r.updated_existing ? "Added to your open request." : "Request sent to the camp team.");
      setDetails("");
      setShowForm(false);
    } catch (e: any) {
      toast.error("Couldn't send the request. Please call instead.", { description: e?.message });
    }
  };

  const needsCall = category === "locked_out" || category === "access";

  return (
    <Card className="border-destructive/30 overflow-hidden">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Siren className="h-4 w-4 text-destructive shrink-0" />
          <span className="font-semibold text-sm sm:text-base">Need help?</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Medical emergency or danger: call <a className="font-semibold text-destructive underline" href="tel:1669">1669</a> (ambulance)
          {" "}or <a className="font-semibold text-destructive underline" href="tel:191">191</a> (police) first.
        </p>

        <div className="grid gap-2">
          {cfg.urgent_call_number && (
            <Button asChild variant="destructive" className="h-12 justify-start text-base">
              <a href={tel(cfg.urgent_call_number)} data-preview-allow>
                <Phone className="h-5 w-5 mr-2" /> Call camp · {cfg.urgent_call_number}
              </a>
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground -mt-1">
            Locked out or can't get in? A phone call is the fastest way to reach someone.
          </p>

          <Button variant="outline" className="justify-start" onClick={openMessages} data-preview-allow>
            <MessageSquare className="h-4 w-4 mr-2" /> Send a CampStay message
            <span className="ml-auto text-[11px] text-muted-foreground">routine</span>
          </Button>

          {cfg.whatsapp_display_number && (
            <Button asChild variant="outline" className="justify-start">
              <a href={wa(cfg.whatsapp_display_number)} target="_blank" rel="noopener noreferrer" data-preview-allow>
                <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp · {cfg.whatsapp_display_number}
              </a>
            </Button>
          )}
        </div>

        <div className="rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground space-y-1">
          {cfg.staffed_hours_text && <p className="font-medium text-foreground">{cfg.staffed_hours_text}</p>}
          <p>
            {cfg.after_hours_notice ||
              "Messages may not be seen right away, especially at night. This is not a guaranteed 24/7 service."}
          </p>
        </div>

        {cfg.urgent_requests_enabled && bookingId && (
          <div className="space-y-2 border-t border-border pt-3">
            {openReq ? (
              <p className="text-xs">
                Your urgent request is open
                {openReq.acknowledged_at ? " — a team member has seen it." : " — not yet seen by staff."}
                {" "}If it can't wait, please call.
              </p>
            ) : null}
            {!showForm ? (
              <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
                <AlertTriangle className="h-4 w-4 mr-1.5" />
                {openReq ? "Add an update" : "Send an urgent request"}
              </Button>
            ) : (
              <div className="space-y-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="What's happening?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>What's happening?</SelectItem>
                    {URGENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {needsCall && cfg.urgent_call_number && (
                  <p className="text-xs text-destructive">Please call as well — a request alone may not reach anyone quickly.</p>
                )}
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000}
                  placeholder="Optional: one line on what you need" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submit} disabled={category === "__none__" || create.isPending}>
                    {create.isPending ? "Sending…" : "Send"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sending a request alerts the camp team. It does not guarantee an immediate response.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
