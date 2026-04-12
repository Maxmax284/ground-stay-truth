import { useState, useEffect } from "react";
import { Key, Save, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSetSecret } from "@/hooks/useIntegrationSecrets";
import { toast } from "sonner";

export function VapidKeySettings() {
  const { user } = useAuth();
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);
  const [privateConfigured, setPrivateConfigured] = useState(false);
  const setSecret = useSetSecret();

  useEffect(() => {
    Promise.all([
      supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle(),
      supabase.rpc("is_secret_configured", { _key: "vapid_private_key" }),
    ]).then(([pubRes, privRes]) => {
      if (pubRes.data?.value) {
        const val = typeof pubRes.data.value === "string" 
          ? pubRes.data.value.replace(/^"|"$/g, "") 
          : (pubRes.data.value as any).key ?? "";
        setPublicKey(val);
      }
      setPrivateConfigured(privRes.data === true);
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    if (!publicKey.trim()) {
      toast.error("Please enter a valid VAPID public key.");
      return;
    }
    setSaving(true);
    try {
      // Save public key to policy_settings
      const { error } = await supabase.from("policy_settings").upsert(
        {
          key: "vapid_public_key",
          value: JSON.stringify(publicKey.trim()),
          description: "VAPID public key for Web Push notifications",
          updated_by: user?.id,
        },
        { onConflict: "key" }
      );
      if (error) throw error;

      // Save private key to integration_secrets if provided
      if (privateKey.trim()) {
        await setSecret.mutateAsync({ key: "vapid_private_key", value: privateKey.trim() });
        setPrivateConfigured(true);
        setPrivateKey("");
      }

      toast.success("VAPID keys saved!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  const publicConfigured = publicKey.trim().length > 10;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Push Notifications (VAPID)</CardTitle>
            <CardDescription>Web Push keys for real-time device notifications</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How to generate VAPID keys:</p>
          <p>Run this in any terminal: <code className="bg-background px-1 py-0.5 rounded">npx web-push generate-vapid-keys</code></p>
          <p>It will output both a public and private key. Paste them below.</p>
        </div>

        {/* Public Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="vapid-public" className="text-sm font-medium">Public Key</Label>
            {publicConfigured ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
                <CheckCircle2 className="h-3 w-3" /> Set
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <XCircle className="h-3 w-3" /> Not set
              </Badge>
            )}
          </div>
          <div className="relative">
            <Input
              id="vapid-public"
              type={showPublic ? "text" : "password"}
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="BPnr3G..."
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowPublic(!showPublic)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
            >
              {showPublic ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* Private Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="vapid-private" className="text-sm font-medium">Private Key</Label>
            {privateConfigured ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
                <CheckCircle2 className="h-3 w-3" /> Secured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <XCircle className="h-3 w-3" /> Not set
              </Badge>
            )}
          </div>
          <div className="relative">
            <Input
              id="vapid-private"
              type={showPrivate ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={privateConfigured ? "••••••••••••" : "Paste private key here..."}
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowPrivate(!showPrivate)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
            >
              {showPrivate ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
          {privateConfigured && (
            <p className="text-[10px] text-muted-foreground">
              Private key is stored securely and never sent back to the browser. Enter a new value to replace it.
            </p>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving || !publicKey.trim()}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save VAPID Keys"}
        </Button>
      </CardContent>
    </Card>
  );
}
