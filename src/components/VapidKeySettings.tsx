import { useState, useEffect } from "react";
import { Key, Save, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function VapidKeySettings() {
  const { user } = useAuth();
  const [publicKey, setPublicKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    supabase
      .from("policy_settings")
      .select("value")
      .eq("key", "vapid_public_key")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const val = typeof data.value === "string" ? data.value : (data.value as any).key ?? "";
          setPublicKey(val);
        }
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
      toast.success("VAPID public key saved!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          Push Notification Keys (VAPID)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          To enable push notifications, generate a VAPID key pair and enter the <strong>public key</strong> below.
          The <strong>private key</strong> must be added as a backend secret named <code className="text-xs bg-muted px-1 py-0.5 rounded">VAPID_PRIVATE_KEY</code>.
        </p>

        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How to generate VAPID keys:</p>
          <p>Run this in any terminal: <code className="bg-background px-1 py-0.5 rounded">npx web-push generate-vapid-keys</code></p>
          <p>Or use an online VAPID key generator.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vapid-public">VAPID Public Key</Label>
          <div className="relative">
            <Input
              id="vapid-public"
              type={showKey ? "text" : "password"}
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="BPnr3G..."
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
            >
              {showKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving || !publicKey.trim()}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Public Key"}
        </Button>
      </CardContent>
    </Card>
  );
}
