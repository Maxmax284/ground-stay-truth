// Client helper for invoking the notify-via-messaging edge function.
// Fire-and-forget by default — never blocks UI on outbound delivery.

import { supabase } from "@/integrations/supabase/client";

export interface NotifyPayload {
  event_type: string;
  subject_id?: string;
  metadata?: Record<string, unknown>;
  target_user_ids?: string[];
  target_roles?: string[];
  guest_user_id?: string;
}

export function notifyViaMessaging(payload: NotifyPayload): void {
  // Fire and forget — bridge delivery should never block the caller.
  supabase.functions.invoke("notify-via-messaging", { body: payload }).catch((err) => {
    console.warn("notify-via-messaging failed:", err);
  });
}
