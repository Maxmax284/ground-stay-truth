
-- Phase 1: Insert AI circuit breaker settings into policy_settings
INSERT INTO public.policy_settings (key, value, description)
VALUES
  ('ai_assistant_enabled', 'true', 'Global AI assistant kill switch'),
  ('ai_guest_enabled', 'true', 'AI features for guest role'),
  ('ai_front_desk_enabled', 'true', 'AI features for front desk role'),
  ('ai_supervisor_enabled', 'true', 'AI features for supervisor role'),
  ('ai_manager_enabled', 'true', 'AI features for manager role'),
  ('ai_admin_enabled', 'true', 'AI features for admin role');

-- Phase 2: Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  reference_id uuid,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Phase 4: Add preferred_language to profiles
ALTER TABLE public.profiles ADD COLUMN preferred_language text NOT NULL DEFAULT 'en';

-- Create index on notifications for fast user lookups
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE read = false;
