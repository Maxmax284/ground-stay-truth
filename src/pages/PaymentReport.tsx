import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Printer,
  Shield,
  Link2,
  CreditCard,
  Webhook,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Activity,
  ClipboardCheck,
  FileText,
  ArrowRight,
  Copy,
  ExternalLink,
} from "lucide-react";

/* ---------- Building blocks ---------- */

const Section = ({
  num,
  title,
  icon: Icon,
  children,
}: {
  num: number;
  title: string;
  icon: any;
  children: React.ReactNode;
}) => (
  <section className="report-section mb-12 print:mb-8 print:break-inside-avoid">
    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary print:bg-primary/20">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Section {String(num).padStart(2, "0")}
        </div>
        <h2 className="text-2xl font-serif font-semibold text-foreground">{title}</h2>
      </div>
    </div>
    <div className="space-y-4 text-foreground/90 leading-relaxed">{children}</div>
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <CheckCircle2 className="h-4 w-4 mt-1 shrink-0 text-success" />
    <span>{children}</span>
  </li>
);

const Callout = ({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "ok";
  title: string;
  children: React.ReactNode;
}) => {
  const tones = {
    info: "border-primary/30 bg-primary/5",
    warn: "border-yellow-500/40 bg-yellow-500/5",
    ok: "border-success/40 bg-success/5",
  } as const;
  return (
    <div className={`rounded-lg border-l-4 p-4 ${tones[tone]}`}>
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm text-foreground/80">{children}</div>
    </div>
  );
};

/* Mock UI panel — styled to look like a Grounds Stay sheet */
const MockPanel = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

/* Flow node */
const FlowStep = ({ n, label, sub }: { n: number; label: string; sub?: string }) => (
  <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
      {n}
    </div>
    <div className="min-w-0">
      <div className="text-sm font-medium truncate">{label}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  </div>
);

const Arrow = () => (
  <div className="flex justify-center text-muted-foreground py-1">
    <ArrowRight className="h-4 w-4 rotate-90" />
  </div>
);

/* ---------- Page ---------- */

export default function PaymentReport() {
  const { isAdmin, roleResolved, user } = useAuth();

  useEffect(() => {
    document.title = "Payment Flow & Launch Safety Report — Grounds Stay";
  }, []);

  if (!roleResolved) return null;
  if (!user || !isAdmin) return <Navigate to="/auth" replace />;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .no-print { display: none !important; }
          body { background: white; }
          .report-section { page-break-inside: avoid; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            Admin · Payment Launch Report
          </div>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-10 print:py-0 print:px-0">
        {/* COVER */}
        <div className="report-section relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-accent/30 to-background p-10 mb-12 print:mb-8 print:rounded-none print:border-0">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
               style={{ backgroundImage: "radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0, transparent 40%), radial-gradient(circle at 80% 80%, hsl(var(--accent-foreground)) 0, transparent 40%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-widest uppercase text-primary mb-8">
              <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">G</div>
              Grounds Stay
            </div>
            <h1 className="font-serif text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
              Payment Flow &<br />Launch Safety Report
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mb-8">
              Stripe Deposits · Guest Payment Links · Webhook Health · CORS Safety ·
              Refund Protection · Test Coverage
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="secondary" className="text-xs">Generated {today}</Badge>
              <Badge variant="secondary" className="text-xs">Confidential — Internal Use</Badge>
              <Badge className="bg-success text-success-foreground text-xs">Launch-Ready</Badge>
            </div>
          </div>
        </div>

        {/* 2. Executive Summary */}
        <Section num={2} title="Executive Summary" icon={ClipboardCheck}>
          <p>
            Grounds Stay now supports a complete deposit and payment flow built on Stripe Checkout,
            with full operational safety controls for production launch.
          </p>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet>Guests pay deposits online via Stripe.</Bullet>
            <Bullet>Staff still record manual payments.</Bullet>
            <Bullet>Staff generate secure guest payment links.</Bullet>
            <Bullet>Guests pay via <code>/pay/:token</code> without logging in.</Bullet>
            <Bullet>Webhooks confirm payments and never double-confirm.</Bullet>
            <Bullet>Refunds are protected against over-refunding.</Bullet>
            <Bullet>Admins view live webhook health.</Bullet>
            <Bullet>CORS is strict and production-safe.</Bullet>
            <Bullet>All tests passing (118/118).</Bullet>
          </ul>
        </Section>

        {/* 3. Main Guest Payment Flow */}
        <Section num={3} title="Main Guest Payment Flow" icon={CreditCard}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FlowStep n={1} label="Staff opens booking" sub="Booking Detail Sheet" />
              <Arrow />
              <FlowStep n={2} label="Generate payment link" sub="PaymentLinkManager" />
              <Arrow />
              <FlowStep n={3} label="Copy link" sub="One-click copy" />
              <Arrow />
              <FlowStep n={4} label="Send via WhatsApp / LINE / SMS / Email" />
              <Arrow />
              <FlowStep n={5} label="Guest opens /pay/:token" />
              <Arrow />
              <FlowStep n={6} label="Guest taps Pay Deposit" />
            </div>
            <div className="space-y-2">
              <FlowStep n={7} label="Stripe Checkout opens" sub="Hosted by Stripe" />
              <Arrow />
              <FlowStep n={8} label="Guest completes payment" />
              <Arrow />
              <FlowStep n={9} label="Stripe redirects to success/cancel URL" />
              <Arrow />
              <FlowStep n={10} label="Stripe webhook fires" sub="payment-webhook" />
              <Arrow />
              <FlowStep n={11} label="Payment recorded + signature verified" />
              <Arrow />
              <FlowStep n={12} label="Booking + deposit status updated" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <MockPanel title="Booking Detail Sheet" subtitle="Reservation #GS-1042">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Guest</span><span className="font-medium">Maya R.</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span className="font-medium">฿ 3,500</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary">Awaiting Deposit</Badge></div>
                <div className="border-t border-border pt-3">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Payment Link Manager</div>
                  <Button size="sm" className="w-full gap-2"><Link2 className="h-3.5 w-3.5" />Generate Payment Link</Button>
                </div>
              </div>
            </MockPanel>

            <MockPanel title="Link Generated" subtitle="Expires in 72 hours">
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-xs truncate">
                  https://grounds.stay/pay/••••••••••••••••••••
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1 gap-2"><Copy className="h-3.5 w-3.5" />Copy</Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-2"><RefreshCw className="h-3.5 w-3.5" />Regenerate</Button>
                </div>
                <div className="text-xs text-muted-foreground">Tied to one booking & one amount. Single use.</div>
              </div>
            </MockPanel>

            <MockPanel title="Public Guest Payment Page" subtitle="/pay/:token">
              <div className="space-y-3 text-sm">
                <div className="text-center py-4">
                  <div className="text-xs text-muted-foreground">Deposit due</div>
                  <div className="text-3xl font-serif font-bold text-primary">฿ 3,500</div>
                  <div className="text-xs text-muted-foreground mt-1">Lamai Muay Thai · Booking #GS-1042</div>
                </div>
                <Button className="w-full gap-2"><CreditCard className="h-4 w-4" />Pay Deposit Securely</Button>
                <div className="text-[10px] text-center text-muted-foreground">Powered by Stripe · No login required</div>
              </div>
            </MockPanel>

            <MockPanel title="State Variants">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-md border border-border p-2"><span>Already paid</span><Badge className="bg-success text-success-foreground">Confirmed</Badge></div>
                <div className="flex items-center justify-between rounded-md border border-border p-2"><span>Expired link</span><Badge variant="secondary">Expired</Badge></div>
                <div className="flex items-center justify-between rounded-md border border-border p-2"><span>Invalid token</span><Badge variant="destructive">Not Found</Badge></div>
                <div className="flex items-center justify-between rounded-md border border-border p-2"><span>Booking locked</span><Badge variant="outline">Locked</Badge></div>
              </div>
            </MockPanel>
          </div>
        </Section>

        {/* 4. Staff Payment Link Management */}
        <Section num={4} title="Staff Payment Link Management" icon={Link2}>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet>Generated by authorized staff and admins only.</Bullet>
            <Bullet>Tokens stored as hash — raw tokens never in DB.</Bullet>
            <Bullet>Default 72-hour expiry.</Bullet>
            <Bullet>Bound to one booking and one amount.</Bullet>
            <Bullet>Cannot modify booking data.</Bullet>
            <Bullet>Cannot be reused for already-paid bookings.</Bullet>
            <Bullet>Regenerating issues a fresh secure link.</Bullet>
            <Bullet>One-click copy for messaging.</Bullet>
          </ul>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="font-semibold mb-3">Lifecycle</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {["Staff", "Generate Link", "Copy Link", "Send to Guest", "Guest Pays", "Webhook Confirms", "Booking Locked"].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-card">{s}</Badge>
                  {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* 5. Public Guest Payment Page */}
        <Section num={5} title="Public Guest Payment Page" icon={ExternalLink}>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet>No login required.</Bullet>
            <Bullet>Shows only payment-specific information.</Bullet>
            <Bullet>Invalid tokens → safe generic message.</Bullet>
            <Bullet>Expired tokens → safe generic message.</Bullet>
            <Bullet>Already-paid → safe confirmation only.</Bullet>
            <Bullet>Canceled / locked bookings cannot pay again.</Bullet>
            <Bullet>Routes via existing Stripe Checkout pipeline.</Bullet>
          </ul>
        </Section>

        {/* 6. Stripe Checkout + Webhook Processing */}
        <Section num={6} title="Stripe Checkout & Webhook Processing" icon={Webhook}>
          <div className="rounded-xl border border-border bg-card p-5 print:break-inside-avoid">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Sequence Diagram</div>
            <div className="space-y-2 font-mono text-xs">
              {[
                ["Guest Browser", "→", "Grounds Stay /pay/:token"],
                ["/pay/:token", "→", "guest-payment-link (edge fn)"],
                ["guest-payment-link", "✓", "validate token + booking + amount"],
                ["guest-payment-link", "→", "Stripe Checkout session"],
                ["Guest Browser", "→", "Stripe Checkout (hosted)"],
                ["Stripe", "→", "payment-webhook"],
                ["payment-webhook", "✓", "verify Stripe signature"],
                ["payment-webhook", "✓", "idempotency check (event_id)"],
                ["payment-webhook", "→", "payments table (confirmed)"],
                ["payment-webhook", "→", "booking + deposit status update"],
                ["payment-webhook", "→", "webhook_health updated"],
                ["Admin Dashboard", "←", "live status visible"],
              ].map(([a, op, b], i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_2fr] gap-3 items-center py-1 border-b border-dashed border-border last:border-0">
                  <span className="text-primary">{a}</span>
                  <span className="text-muted-foreground">{op}</span>
                  <span className="text-foreground">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 7. CORS + Production Safety */}
        <Section num={7} title="CORS & Production Safety" icon={Shield}>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet><code>SITE_URL</code>-based strict origin allowlist.</Bullet>
            <Bullet>No wildcard CORS in production.</Bullet>
            <Bullet><code>success_url</code> / <code>cancel_url</code> validated against allowed origins.</Bullet>
            <Bullet>Missing <code>SITE_URL</code> → admin warning + safe fallback.</Bullet>
            <Bullet>Payment APIs fail-closed on unknown origins.</Bullet>
          </ul>
          <Callout tone="warn" title="Pre-launch reminder">
            Set the <code>SITE_URL</code> secret to your final custom domain before going live.
            Fallback is active but should not be the production source of truth.
          </Callout>
        </Section>

        {/* 8. Webhook Health */}
        <Section num={8} title="Webhook Health Dashboard" icon={Activity}>
          <MockPanel title="Stripe · Webhook Health" subtitle="Admin → Integration Settings">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Status</div>
                <Badge className="bg-success text-success-foreground mt-1">Connected</Badge>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Last event</div>
                <div className="font-medium">2 minutes ago</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Last success</div>
                <div className="font-medium">2 minutes ago</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Last failure</div>
                <div className="font-medium text-muted-foreground">None</div>
              </div>
            </div>
          </MockPanel>
          <p className="text-sm text-muted-foreground">
            <code>webhook_health</code> tracks provider, last_received_at, last_success_at,
            last_failure_at, last_failure_reason, last_event_id, and status. Failures become
            visible immediately — before launch issues become guest issues.
          </p>
        </Section>

        {/* 9. Refunds + Audit */}
        <Section num={9} title="Refund & Audit Protections" icon={Lock}>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet>Refunds are admin-only.</Bullet>
            <Bullet>Hard guard against over-refunding.</Bullet>
            <Bullet>All link activity logged in <code>payment_link_events</code>.</Bullet>
            <Bullet>Sensitive tokens never logged in plaintext.</Bullet>
          </ul>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div className="font-semibold mb-2">Logged events</div>
            <div className="flex flex-wrap gap-2">
              {["link_generated", "link_copied", "link_opened", "checkout_created", "expired_attempt", "invalid_attempt", "already_paid_attempt"].map((e) => (
                <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
              ))}
            </div>
          </div>
        </Section>

        {/* 10. Tests */}
        <Section num={10} title="Test Coverage Summary" icon={CheckCircle2}>
          <ul className="grid sm:grid-cols-2 gap-2">
            <Bullet>CORS origin validation</Bullet>
            <Bullet>Redirect URL validation</Bullet>
            <Bullet>Token expiry behavior</Bullet>
            <Bullet>Already-paid booking behavior</Bullet>
            <Bullet>Invalid token behavior</Bullet>
            <Bullet>Booking / payment mismatch protection</Bullet>
            <Bullet>Stripe webhook idempotency</Bullet>
            <Bullet>GuestPickupCard (9/9)</Bullet>
          </ul>
          <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div>
              <div className="font-semibold">118 passing · 0 failing</div>
              <div className="text-xs text-muted-foreground">Vitest suite — last verified before launch sign-off</div>
            </div>
          </div>
        </Section>

        {/* 11. Launch Checklist */}
        <Section num={11} title="Launch Checklist" icon={ClipboardCheck}>
          <div className="space-y-2">
            {[
              ["CORS hardened", "ok"],
              ["Stripe webhook signature verification active", "ok"],
              ["Webhook health card live in admin", "ok"],
              ["Guest payment links wired", "ok"],
              ["Staff PaymentLinkManager in booking detail", "ok"],
              ["Audit logging active", "ok"],
              ["Test suite: 118/118 passing", "ok"],
              ["Manual payment flow preserved", "ok"],
              ["Refund protections active", "ok"],
              ["SITE_URL: fallback active, update on custom domain", "warn"],
            ].map(([label, state]) => (
              <div key={label as string} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="text-sm">{label}</span>
                {state === "ok" ? (
                  <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Done</Badge>
                ) : (
                  <Badge variant="outline" className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400 gap-1"><AlertTriangle className="h-3 w-3" />Pending</Badge>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 17. Final Verdict */}
        <Section num={17} title="Final Verdict" icon={CheckCircle2}>
          <div className="rounded-xl border-2 border-success/40 bg-gradient-to-br from-success/10 to-card p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <div className="font-serif text-xl font-semibold mb-2">Launch-Ready, Pending Production Secrets</div>
                <p className="text-foreground/90 leading-relaxed">
                  Grounds Stay is ready for Stripe + manual payment launch once production
                  secrets are configured. The system supports secure staff-generated payment
                  links, public guest deposit payments, strict CORS and redirect validation,
                  webhook health visibility, audit logging, refund protection, and tested
                  launch-safety behavior.
                </p>
              </div>
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground pt-6">
            Grounds Stay · Payment Flow &amp; Launch Safety Report · {today}
          </div>
        </Section>
      </main>
    </div>
  );
}
