import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX = 6;

/** Each staff member manages their own list of escalation inboxes. Own row only; changes are audited. */
export function MyAlertEmail() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  const { data: list = [] } = useQuery({
    queryKey: ["my-alert-email", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("staff_alert_emails" as any).select("email, extra_emails").eq("user_id", user!.id).maybeSingle();
      const d = data as any;
      return d ? [d.email as string, ...((d.extra_emails ?? []) as string[])] : [];
    },
  });

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const q = supabase.from("staff_alert_emails" as any);
      const { error } = next.length
        ? await q.upsert({ user_id: user!.id, email: next[0], extra_emails: next.slice(1), updated_at: new Date().toISOString() })
        : await q.delete().eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-alert-email"] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't save"),
  });

  const trimmed = value.trim().toLowerCase();
  const invalid = trimmed !== "" && !EMAIL_RE.test(trimmed);
  const dupe = list.some((e) => e.toLowerCase() === trimmed);

  const add = () => {
    if (!trimmed || invalid || dupe) return;
    save.mutate([...list, trimmed], { onSuccess: () => { setValue(""); toast.success("Alert email added"); } });
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <label htmlFor="my-alert-email" className="text-xs font-medium">My escalation alert emails</label>
      {list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">None added — alerts go to your login email ({user?.email}).</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((e) => (
            <li key={e} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs">
              <span className="break-all">{e}</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" aria-label={`Remove ${e}`} disabled={save.isPending}
                onClick={() => save.mutate(list.filter((x) => x !== e), { onSuccess: () => toast.success("Removed") })}>
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX && (
        <div className="flex gap-2">
          <Input id="my-alert-email" type="email" inputMode="email" autoComplete="email" placeholder="add another inbox"
            value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-invalid={invalid} />
          <Button size="sm" disabled={!trimmed || invalid || dupe || save.isPending} onClick={add}>Add</Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {invalid ? "That doesn't look like an email." : dupe ? "Already on your list." :
          `Up to ${MAX}. Every inbox here gets the same alert. Alerts include booking details — use inboxes only you (or trusted staff) read. An email landing doesn't mean anyone's on the way.`}
      </p>
    </div>
  );
}
