
-- Enums
DO $$ BEGIN
  CREATE TYPE public.guidance_tone AS ENUM ('neutral','friendly','dry_humor','thai_east_coast');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guidance_risk AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guidance_status AS ENUM ('draft','approved','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE public.platform_guidance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   text NOT NULL UNIQUE,
  feature_name          text NOT NULL,
  section               text,
  route                 text,
  short_tooltip         text NOT NULL,
  page_help             text,
  detailed_explanation  text,
  used_for              text[] NOT NULL DEFAULT '{}',
  not_used_for          text[] NOT NULL DEFAULT '{}',
  common_tasks          text[] NOT NULL DEFAULT '{}',
  step_by_step          jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings              text[] NOT NULL DEFAULT '{}',
  related_keys          text[] NOT NULL DEFAULT '{}',
  roles_allowed         text[] NOT NULL DEFAULT ARRAY['admin','manager','supervisor','staff','front_desk'],
  tone                  public.guidance_tone NOT NULL DEFAULT 'neutral',
  risk_level            public.guidance_risk NOT NULL DEFAULT 'low',
  guest_visible         boolean NOT NULL DEFAULT false,
  internal_only         boolean NOT NULL DEFAULT true,
  status                public.guidance_status NOT NULL DEFAULT 'draft',
  ai_prompt_suggestions text[] NOT NULL DEFAULT '{}',
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_guidance_status_idx ON public.platform_guidance(status);
CREATE INDEX platform_guidance_route_idx  ON public.platform_guidance(route);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_guidance TO authenticated;
GRANT ALL ON public.platform_guidance TO service_role;

-- RLS
ALTER TABLE public.platform_guidance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read approved guidance"
  ON public.platform_guidance FOR SELECT
  TO authenticated
  USING (status = 'approved' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin or manager can insert guidance"
  ON public.platform_guidance FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin or manager can update guidance"
  ON public.platform_guidance FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Admin can delete guidance"
  ON public.platform_guidance FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Tone-safety trigger: high risk = neutral; guest-visible = neutral/friendly only.
CREATE OR REPLACE FUNCTION public.enforce_guidance_tone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.risk_level = 'high' THEN
    NEW.tone := 'neutral';
  ELSIF NEW.guest_visible = true AND NEW.tone NOT IN ('neutral','friendly') THEN
    NEW.tone := 'friendly';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER platform_guidance_tone_safety
  BEFORE INSERT OR UPDATE ON public.platform_guidance
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guidance_tone();

-- ============ SEED: 20 approved entries ============
INSERT INTO public.platform_guidance
  (key, feature_name, section, route, short_tooltip, page_help, detailed_explanation,
   used_for, not_used_for, common_tasks, step_by_step, warnings, related_keys,
   roles_allowed, tone, risk_level, guest_visible, internal_only, status, ai_prompt_suggestions)
VALUES

('maintenance_block','Maintenance Block','Calendar','/calendar',
 'Use this for repairs, holds, or blackout dates. For real guest bookings, use Add Existing Booking. Same same? Absolutely not same.',
 'Maintenance blocks make a unit unavailable for non-guest reasons: repairs, owner holds, deep cleans, or blackout dates. They do not store guest names, deposits, or Front Desk workflow.',
 'Use maintenance blocks to hide a unit from availability without pretending a guest exists. Real reservations always go through Add Existing Booking so the guest name, deposit, and Front Desk workflow all line up.',
 ARRAY['Repairs','Owner holds','Deep clean','Blackout dates'],
 ARRAY['Real guest reservations','Deposit collection','Front Desk workflow'],
 ARRAY['Block a unit for repair','Reserve unit for owner use','Take unit offline temporarily'],
 '[{"step":"Open Calendar"},{"step":"Select the unit and date range"},{"step":"Create Maintenance Block with a reason"},{"step":"Confirm the block appears greyed out"}]'::jsonb,
 ARRAY['Do not use for real guests — future you will hate this','Blocks bypass deposit and guest portal flow'],
 ARRAY['add_existing_booking','room_available'],
 ARRAY['admin','manager','supervisor'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['When should I use a maintenance block?','What is the difference between maintenance block and existing booking?']),

('add_existing_booking','Add Existing Booking','Bookings','/bookings',
 'Use this for real reservations made outside the system. It blocks the room, shows the guest name, and lets you request deposits. Basically rescuing bookings from WhatsApp chaos.',
 'Add Existing Booking captures a real reservation that was made by phone, WhatsApp, walk-in, or any channel outside GroundStay. It creates a real booking record with the guest name and lets you send a deposit link.',
 'Use this whenever a real human booked but the system does not know about them yet. Enter their name (manual is fine), pick the unit and dates, set the total, and save. From there you can copy a deposit link and send it however you talk to the guest.',
 ARRAY['Phone bookings','WhatsApp bookings','Walk-ins','OTA bookings not yet synced'],
 ARRAY['Blocking a room for repair','Owner holds','Fake bookings for testing'],
 ARRAY['Create the booking','Copy deposit link','Send link via WhatsApp or email'],
 '[{"step":"Bookings → Add Existing Booking"},{"step":"Enter guest name (manual guest name is fine)"},{"step":"Pick unit, check-in and check-out"},{"step":"Set total price and guest count"},{"step":"Save"},{"step":"Open Payments → copy deposit link"}]'::jsonb,
 ARRAY['Do not hide guests inside maintenance blocks','Set the total price so deposit auto-calculates'],
 ARRAY['maintenance_block','deposit_link','manual_guest_name'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['How do I add an existing booking?','How do I record a WhatsApp booking?']),

('deposit_link','Deposit / Payment Link','Payments','/admin/payment-report',
 'Copies the secure payment link so you can send it manually by WhatsApp or email. No need to go digging through Stripe like a raccoon in a filing cabinet.',
 'Every booking with an outstanding deposit gets a secure payment link. You can copy the link, share it however you talk to the guest, and the system tracks when it is paid.',
 'The deposit link is a signed URL tied to the booking. Guests click it, pay through Stripe, and the booking auto-advances. If the guest paid offline, use Manual Payment instead.',
 ARRAY['Sending deposit request','Chasing overdue deposit','Sharing via WhatsApp or email'],
 ARRAY['Recording an already-received cash payment'],
 ARRAY['Copy link','Send via WhatsApp','Send via email'],
 '[{"step":"Open the booking"},{"step":"Go to Payments"},{"step":"Copy payment link"},{"step":"Paste into your channel of choice"}]'::jsonb,
 ARRAY['Links expire — regenerate if the guest waited too long','Do not share the link in a public group'],
 ARRAY['manual_payment','payment_pending','add_existing_booking'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'neutral','high',false,true,'approved',
 ARRAY['Where do I send a deposit link?','Why is the deposit link missing?']),

('front_desk','Front Desk','Front Desk','/front-desk',
 'Today’s guest movement: arrivals, check-ins, check-outs, active stays. Front line, not the engine room.',
 'Front Desk shows what is happening with real guests today: who is arriving, who is here, who is leaving, and what needs attention. Use this for daily operations.',
 'The Front Desk view rolls up arrivals, check-ins, waiting guests, pickups, missing documents, and turnover for the day. Click any tile to drill into the specific guests behind the number.',
 ARRAY['Daily operations','Guest arrivals and departures','Check-in and check-out','Spotting missing documents'],
 ARRAY['System health','Backend diagnostics','Editing policies'],
 ARRAY['See who arrives today','Mark guest checked in','Find guests waiting to pay balance'],
 '[{"step":"Open Front Desk"},{"step":"Scan the tiles at the top for anything that needs attention"},{"step":"Click a tile to see the specific guests"},{"step":"Open a booking to take action"}]'::jsonb,
 ARRAY['Do not confuse Front Desk with Ops Control Tower — different tool, different job'],
 ARRAY['ops_control_tower','turnover','pickup_pending'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','low',false,true,'approved',
 ARRAY['Who needs attention today?','What arrivals are waiting?','Teach me Front Desk']),

('ops_control_tower','Ops Control Tower','Admin','/ops-control-tower',
 'Admin-only engine room. Use this to check if payments, portal, pickups, alerts, and guest transit are working before anything turns into a Thai soap opera.',
 'Ops Control Tower is the admin view of whether GroundStay itself is behaving: Stripe webhook health, payment link generation, messaging, flights, audit log, notifications, and unresolved exceptions.',
 'This is where you check whether the platform is healthy, not what individual guests are doing. If a tile is yellow or red, click through to see why. Use this before big operational days to make sure nothing is silently broken.',
 ARRAY['Checking system health','Reviewing unresolved alerts','Diagnosing why something is not working','Pre-shift readiness check'],
 ARRAY['Daily guest operations','Editing bookings','Recording payments'],
 ARRAY['Confirm Stripe is healthy','Review unresolved exceptions','Check messaging channel status'],
 '[{"step":"Open Ops Control Tower"},{"step":"Scan the systems matrix for anything not green"},{"step":"Click a broken tile for detail"},{"step":"Escalate or fix root cause; do not silence alerts"}]'::jsonb,
 ARRAY['Admin-only — do not share screenshots with guests','Fix causes, not the alerts themselves'],
 ARRAY['operations_monitor','stripe_awaiting_first_event','front_desk'],
 ARRAY['admin'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['Explain unresolved alerts','Show system health issues','Teach me Ops Control Tower']),

('stripe_awaiting_first_event','Awaiting First Stripe Event','System Health','/monitoring',
 'No real Stripe event has reached GroundStay yet. Not broken — Stripe just hasn’t said sawasdee yet.',
 'This status means the webhook endpoint is configured but no signed Stripe event has arrived yet. Once a real event fires, this flips to healthy.',
 'GroundStay only marks Stripe healthy after receiving a signed event. Unsigned probes and manual pings do not count. Trigger a Stripe test event from the Stripe dashboard to move this to healthy.',
 ARRAY['New Stripe integration','After changing webhook secret'],
 ARRAY['Diagnosing a real payment failure'],
 ARRAY['Trigger a Stripe test event','Confirm status flips to healthy'],
 '[{"step":"Open Stripe dashboard → Developers → Webhooks"},{"step":"Send a test event to the GroundStay endpoint"},{"step":"Return to Ops Control Tower and confirm healthy"}]'::jsonb,
 ARRAY['Do not treat awaiting as failing','Do not weaken signature verification to make it green'],
 ARRAY['ops_control_tower','operations_monitor'],
 ARRAY['admin'],
 'neutral','high',false,true,'approved',
 ARRAY['Why is Stripe not green?','What does awaiting first Stripe event mean?']),

('manual_guest_name','Manual Guest Name','Bookings','/bookings',
 'Use this when the guest does not have an account yet. Real people still get names. Revolutionary technology, apparently.',
 'Manual guest name lets you save a real guest identity on a booking even when there is no linked profile yet. It shows up everywhere the guest name appears.',
 'When you type a name into the manual guest name field, the platform stores it on the booking itself and uses it across Front Desk, Calendar, Messaging, and Ops. If the guest later creates an account and links, the profile takes over automatically.',
 ARRAY['Bookings made by phone or WhatsApp','Walk-ins without an account','OTA bookings not yet linked'],
 ARRAY['Overriding a real profile name'],
 ARRAY['Save the guest name during Add Existing Booking'],
 '[{"step":"During booking creation, enter the guest name in the manual field"},{"step":"Add email or phone if you have them"},{"step":"Save booking"}]'::jsonb,
 ARRAY['Do not type Training Guest or Test as the name — that is a guest type, not an identity'],
 ARRAY['add_existing_booking','training_guest'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'dry_humor','low',false,true,'approved',
 ARRAY['Why is the guest name missing?','How do I add a guest without an account?']),

('training_guest','Training Guest','Bookings',NULL,
 'This is a guest type, not the guest’s name. If it becomes the main label, the system is being dramatic.',
 'Training Guest is a classification tag for guests attending a training program. It is not a substitute for the guest’s actual name.',
 'The Training Guest tag helps reporting and workflows recognize training bookings. The visible label everywhere should still be the guest’s real name (via profile or manual guest name).',
 ARRAY['Tagging bookings tied to a training package'],
 ARRAY['Replacing the guest name'],
 ARRAY['Confirm the guest name is real, not the tag'],
 '[]'::jsonb,
 ARRAY['If Training Guest appears as the main name, the manual guest name field is missing'],
 ARRAY['manual_guest_name'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'dry_humor','low',false,true,'approved',
 ARRAY['What does Training Guest mean?']),

('pickup_pending','Airport Pickup Pending','Front Desk','/front-desk',
 'Pickup is not confirmed yet. Jai yen yen, but check this before the guest starts messaging from baggage claim.',
 'Pickup Pending means a pickup was requested but no driver has been assigned or confirmed. Guests arriving soon with a pending pickup are a top escalation priority.',
 'The system flags pickups without a driver, especially within 24 hours of arrival. Confirm the pickup, assign a driver, or contact the guest before they land.',
 ARRAY['Airport arrival coordination','Escalating unassigned pickups'],
 ARRAY['Guests who arranged their own transport'],
 ARRAY['Assign a driver','Message guest with pickup details','Escalate to admin if flight is imminent'],
 '[{"step":"Open Front Desk → Pickups"},{"step":"Open the pending pickup"},{"step":"Assign a driver or confirm cancellation"},{"step":"Message the guest with pickup details"}]'::jsonb,
 ARRAY['Do not mark confirmed unless a driver is actually assigned'],
 ARRAY['front_desk','lost_guest_assist'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['Why is pickup not appearing?','What arrivals need a driver?']),

('turnover','Turnover / Housekeeping','Front Desk','/front-desk',
 'Rooms flipping between guests. Do not sell chaos with pillows.',
 'Turnover tracks rooms that need cleaning between checkout and the next check-in. A missed turnover means the next guest walks into a dirty room.',
 'Every completed checkout auto-creates a housekeeping task, timed to the next arrival minus the cleaning buffer. Turnover Board on Front Desk shows which rooms are still pending or in progress today.',
 ARRAY['Post-checkout cleaning','Preparing rooms for next arrival'],
 ARRAY['Deep-clean scheduling','Maintenance repairs'],
 ARRAY['Mark task in progress','Complete task','Escalate if turnover is late'],
 '[{"step":"Open Front Desk → Turnover Board"},{"step":"Pick a pending task"},{"step":"Update status as cleaning progresses"}]'::jsonb,
 ARRAY['Do not mark completed unless the room is actually ready'],
 ARRAY['front_desk','housekeeping'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'dry_humor','medium',false,true,'approved',
 ARRAY['What rooms need turnover today?','Why is housekeeping task missing?']),

('housekeeping','Housekeeping','Operations','/front-desk',
 'Track rooms that need cleaning or turnover before they go back online. Do not sell chaos with pillows.',
 'Housekeeping covers cleaning tasks, turnover between guests, and readiness checks. Tasks flow from checkout completion into a queue with due times.',
 'Housekeeping tasks are auto-created from checkouts and can also be added manually. Each task has a due-by time based on the next arrival and the cleaning buffer policy.',
 ARRAY['Post-checkout cleaning','Between-guest turnover','Readiness checks'],
 ARRAY['Maintenance repairs — use Maintenance Requests instead'],
 ARRAY['Complete a task','Add a manual task','Mark room ready'],
 '[]'::jsonb,
 ARRAY['Do not skip readiness confirmation'],
 ARRAY['turnover','maintenance_block'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['What rooms need cleaning?','How do I mark a room ready?']),

('guest_portal_preview','Guest Portal Preview','Admin','/guest',
 'Shows what the guest sees without pretending to be the guest. Helpful, and much less creepy.',
 'Guest Portal Preview lets staff see the guest-facing portal exactly as a guest would see it, without impersonation.',
 'Use this to verify what a guest sees before or after arrival: their booking, arrival guide, stay essentials, and messaging. Nothing you click here sends messages or changes state.',
 ARRAY['Verifying guest view','Debugging guest portal issues'],
 ARRAY['Sending messages as the guest','Editing guest data'],
 ARRAY['Confirm arrival guide looks right','Confirm stay essentials show'],
 '[]'::jsonb,
 ARRAY['Read-only preview — actions here do not fire real messages'],
 ARRAY['messages','front_desk'],
 ARRAY['admin','manager','supervisor'],
 'dry_humor','low',false,true,'approved',
 ARRAY['What does the guest see?']),

('payment_pending','Payment Pending','Payments','/admin/payment-report',
 'Payment is still unpaid or waiting. Do not assume paid because someone said "I send already" unless the system agrees.',
 'Payment Pending means an obligation exists (deposit, booking fee, security deposit, or balance) but no confirmed payment has been recorded.',
 'Pending payments block booking progression. Send or resend a payment link, or record a Manual Payment if the money already arrived offline. The system is the source of truth — vibes are not.',
 ARRAY['Chasing outstanding balances','Sending deposit links','Confirming offline payments'],
 ARRAY['Marking paid without evidence'],
 ARRAY['Copy payment link','Record manual payment','Escalate stale obligations'],
 '[]'::jsonb,
 ARRAY['Never mark paid on trust','Verify amounts match the booking obligation'],
 ARRAY['deposit_link','manual_payment'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'neutral','high',false,true,'approved',
 ARRAY['Where do I see unpaid bookings?','Why is this booking stuck pending?']),

('manual_payment','Manual Payment','Payments','/admin/payment-report',
 'Use this only when money was actually received by cash, bank transfer, or an approved offline method. Vibes are not payment confirmation.',
 'Manual Payment records a payment that happened outside Stripe: cash, bank transfer, or another approved offline method. It moves the booking forward as if the online payment succeeded.',
 'Only record a manual payment when you have actually seen or verified the funds. This is a high-trust action — every manual payment is audited.',
 ARRAY['Cash payments','Bank transfers','Verified offline settlements'],
 ARRAY['Best-effort guesses','Guest promises','WhatsApp receipts you have not verified'],
 ARRAY['Record manual payment against a pending obligation'],
 '[{"step":"Open the booking"},{"step":"Payments → Record Manual Payment"},{"step":"Enter amount, method, and reference"},{"step":"Save — this is audited"}]'::jsonb,
 ARRAY['Never record unverified payments','Amount must match the obligation'],
 ARRAY['deposit_link','payment_pending'],
 ARRAY['admin','manager','supervisor'],
 'neutral','high',false,true,'approved',
 ARRAY['How do I record cash payment?','How do I record a bank transfer?']),

('messages','Messages','Messages','/messages',
 'Guest messages live here. Reply clearly, keep it calm, and don’t start a novel unless the guest started one first.',
 'The Messages inbox aggregates guest conversations from the platform and messaging channels. Reply from here to keep everything in one place.',
 'Threads are per-guest. Drafts can be assisted by AI but nothing sends automatically. All outbound responses are logged.',
 ARRAY['Replying to guests','Coordinating during stay','Sending post-checkout notes'],
 ARRAY['Broadcasts','Marketing blasts'],
 ARRAY['Reply to a thread','Draft a response','Mark thread resolved'],
 '[]'::jsonb,
 ARRAY['Do not paste sensitive documents into replies'],
 ARRAY['notifications','guest_portal_preview'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'dry_humor','low',false,true,'approved',
 ARRAY['How do I reply to a guest?','Draft a reply to guest']),

('notifications','Notifications','System',NULL,
 'Alerts that need attention. Some are urgent. Some are just the system tapping your shoulder like, "hey boss, look at this."',
 'Notifications surface operational events that may need action: new bookings, payments received, arrivals, exceptions, and system health warnings.',
 'Not every notification is urgent, but each one exists for a reason. Cluster by category, act on the urgent ones, and let the rest settle.',
 ARRAY['Booking alerts','Payment alerts','System health warnings','Guest activity'],
 ARRAY['Marketing','Silent mode for real alerts'],
 ARRAY['Open a notification','Dismiss cleared items','Escalate anything unclear'],
 '[]'::jsonb,
 ARRAY['Do not mute critical categories','Do not dismiss without reading'],
 ARRAY['messages','ops_control_tower'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','low',false,true,'approved',
 ARRAY['Which notifications need action?','Why did I get this booking notification?']),

('booking_source','Booking Source','Bookings',NULL,
 'Shows where the booking came from: direct, WhatsApp, phone, walk-in, OTA, or other. Basically, which door the chaos entered through.',
 'Booking Source tags where a reservation originated. Used for reporting and reconciliation.',
 NULL,
 ARRAY['Reporting','Channel reconciliation','Understanding demand mix'],
 ARRAY['Guest-facing display'],
 ARRAY['Set source on Add Existing Booking'],
 '[]'::jsonb,
 ARRAY['Pick honestly — future reports depend on it'],
 ARRAY['add_existing_booking'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'dry_humor','low',false,true,'approved',
 ARRAY['What does booking source mean?']),

('room_available','Room Available','Units','/units',
 'This room is open for booking. Please make sure it is actually ready, not "ready" in the optimistic island-time sense.',
 'A room shown as Available has no active booking, maintenance block, or overlapping hold for the selected dates.',
 'Availability is calculated from bookings, maintenance blocks, and unit active status. If a room shows available but should not be, check maintenance blocks and unit active flag.',
 ARRAY['Verifying open inventory','Assigning walk-ins'],
 ARRAY['Owner-held rooms — those should be maintenance blocked'],
 ARRAY['Confirm turnover is complete','Assign to a booking'],
 '[]'::jsonb,
 ARRAY['Available in the system does not mean physically ready — confirm turnover'],
 ARRAY['maintenance_block','turnover'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['Why does this room still show available?']),

('operations_monitor','Operations Monitor','Admin','/monitoring',
 'Operational health at a glance. No fires right now? Enjoy the rare peace.',
 'Operations Monitor rolls up webhook health, background jobs, and integration status. Complements Ops Control Tower for a shorter at-a-glance view.',
 'Use this to spot-check whether integrations and background jobs are healthy. Anything red or yellow deserves a look; missing Stripe signatures from unsigned probes are not treated as failures.',
 ARRAY['Quick health check','Spotting integration warnings'],
 ARRAY['Detailed exception triage — use Ops Control Tower'],
 ARRAY['Refresh status','Investigate warnings'],
 '[]'::jsonb,
 ARRAY['Do not confuse awaiting first event with failing'],
 ARRAY['ops_control_tower','stripe_awaiting_first_event'],
 ARRAY['admin'],
 'neutral','medium',false,true,'approved',
 ARRAY['Show system health issues','Explain this warning']),

('lost_guest_assist','Lost Guest Assist','Front Desk',NULL,
 'Use this when a guest is lost, confused, or their taxi driver has entered the shadow realm. Ask for a location pin first.',
 'Lost Guest Assist helps staff guide a guest who is physically lost, late, or stuck with a driver who cannot navigate. Uses approved directions and taxi text only.',
 'Ask for the guest’s live location pin, confirm where they are trying to go (reception, accommodation, pickup point), check booking and pickup context, and draft a reply using approved wording. Never invent directions. Escalate if late-night or unclear.',
 ARRAY['Guest lost en route','Taxi driver cannot find location','Guest late from airport'],
 ARRAY['Sending directions the business has not approved','Promising pickup that is not confirmed'],
 ARRAY['Request location pin','Confirm destination','Send approved Thai taxi text','Escalate to admin'],
 '[{"step":"Ask the guest to share their live location pin"},{"step":"Confirm where they are trying to go"},{"step":"Check booking and pickup status"},{"step":"Send approved taxi/location text if applicable"},{"step":"Escalate if urgent or unclear"}]'::jsonb,
 ARRAY['Do not invent landmarks or directions','Do not promise pickup unless confirmed','Draft only — never auto-send'],
 ARRAY['pickup_pending','front_desk','messages'],
 ARRAY['admin','manager','supervisor','staff','front_desk'],
 'thai_east_coast','medium',false,true,'approved',
 ARRAY['Guest is lost, what should I say?','Guest says taxi can’t find us']);
