/**
 * MfaBackupCodesCard — generate and re-generate single-use recovery codes.
 *
 * Codes are minted server-side (mfa-manage) and shown exactly once. Only
 * hashes are stored, so a lost list cannot be recovered — only replaced.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBackupCodeCount, useMfaStatus } from "@/hooks/useMfa";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function MfaBackupCodesCard() {
  const status = useMfaStatus();
  const { data: remaining, isLoading } = useBackupCodeCount();
  const qc = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-manage", {
        body: { action: "generate" },
      });
      const message = (data as { error?: string } | null)?.error;
      if (error || message) {
        toast.error(message ?? "Could not generate recovery codes.");
        return;
      }
      setCodes(((data as { codes?: string[] }).codes ?? []).slice());
      qc.invalidateQueries({ queryKey: ["mfa-backup-codes-remaining"] });
      toast.success("Recovery codes created. Save them now — they're shown only once.");
    } finally {
      setBusy(false);
    }
  };

  if (!status.verified) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          Recovery codes
          {!isLoading && (
            <Badge variant="outline" className="ml-auto text-xs">
              {remaining ?? 0} unused
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          One-time codes to get back in if you lose your phone. Each code works once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {codes ? (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(codes.join("\n"));
                  toast.success("Copied");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy codes
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>
                I've saved them
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Store these somewhere safe. They will not be shown again.
            </p>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {(remaining ?? 0) > 0 ? "Generate new codes" : "Generate recovery codes"}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate new recovery codes?</AlertDialogTitle>
            <AlertDialogDescription>
              Any codes you were given before stop working immediately. The new list is shown once —
              save it before closing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generate()}>Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default MfaBackupCodesCard;
