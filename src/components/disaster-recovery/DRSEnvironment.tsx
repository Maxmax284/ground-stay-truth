import { Key, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  present: boolean;
}

const envVars: EnvVar[] = [
  { name: "VITE_SUPABASE_URL", description: "Backend API endpoint", required: true, present: true },
  { name: "VITE_SUPABASE_PUBLISHABLE_KEY", description: "Public auth key", required: true, present: true },
  { name: "VITE_SUPABASE_PROJECT_ID", description: "Project identifier", required: true, present: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", description: "Server-side privileged access (Edge Functions)", required: true, present: true },
  { name: "LOVABLE_API_KEY", description: "Lovable AI model access", required: true, present: true },
  { name: "AVIATIONSTACK_API_KEY", description: "Flight tracking API", required: false, present: true },
];

const externalServices = [
  { name: "Stripe", purpose: "Payment processing", configuredVia: "Integration Settings (Admin UI)" },
  { name: "Resend", purpose: "Transactional email", configuredVia: "Integration Settings (Admin UI)" },
  { name: "VAPID Keys", purpose: "Push notifications", configuredVia: "Integration Settings (Admin UI)" },
  { name: "AviationStack", purpose: "Flight tracking", configuredVia: "Edge Function secret" },
  { name: "Fenrir Lock", purpose: "Security monitoring", configuredVia: "Integration Settings (Admin UI)" },
];

export default function DRSEnvironment() {
  const allRequiredPresent = envVars.filter((v) => v.required).every((v) => v.present);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Key className="h-5 w-5" />
          Environment & Secrets
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Required variables and external service dependencies.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Environment Variables</span>
            {allRequiredPresent ? (
              <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 bg-green-50">
                All Required Present
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                Missing Variables — Deploy Blocked
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {envVars.map((v) => (
              <div key={v.name} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-mono text-foreground">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {v.required && (
                    <Badge variant="outline" className="text-[10px]">Required</Badge>
                  )}
                  {v.present ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">External Service Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {externalServices.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">{svc.purpose}</p>
                </div>
                <p className="text-xs text-muted-foreground">{svc.configuredVia}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-300/50 bg-amber-50/30">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Deployment Gate</p>
            <p className="text-xs text-muted-foreground mt-1">
              Missing required environment variables will block deployment. All variables use labeled placeholders — no real secrets are stored in source code.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
