import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Each staff member sets their own inbox for escalation emails. Only their own row; changes are audited. */
export function MyAlertEmail() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const { data } = useQuery({
    queryKey: ["my-alert-email", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("staff_alert_emails" as any).select("email").eq("user_id", user!.id).maybeSingle();
      return (data as any)?.email as string | undefined;
    },
  });
  useEffect(() => { setValue(data ?? ""); }, [data]);

  const save = useMutation({
    mutationFn: async (email: string) => {
      const q = supabase.from("staff_alert_emails" as any);
      const { error } = email
        ? await q.upsert({ user_id: user!.id, email, updated_at: new Date().toISOString() })
        : await q.delete().eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alert email saved"); qc.invalidateQueries({ queryKey: ["my-alert-email"] }); },
    onError: (e: any) => toast.error(e.message ?? "Couldn't save"),
  });

  const trimmed = value.trim();
  const invalid = trimmed !== "" && !EMAIL_RE.test(trimmed);

  return (
    <div className="space-y-1.5 rounded-md border border-border p-2.5">
      <label htmlFor="my-alert-email" className="text-xs font-medium">My email for escalation alerts</label>
      <div className="flex gap-2">
        <Input id="my-alert-email" type="email" inputMode="email" autoComplete="email" placeholder={user?.email ?? "you@example.com"}
          value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={invalid} />
        <Button size="sm" disabled={invalid || save.isPending || trimmed === (data ?? "")} onClick={() => save.mutate(trimmed)}>Save</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {invalid ? "That doesn't look like an email." : "Leave blank to use your login email. Alerts include booking details, so use an inbox only you read. An email arriving doesn't mean anyone is on the way."}
      </p>
    </div>
  );
}
