/**
 * War Room Simulation — Mission Definitions (Phase A + B)
 * Each mission is a sequence of instructional steps.
 */

import type { AppRole } from "@/lib/permissions";

export interface MissionStep {
  title: string;
  description: string;
  /** Which simulated role the user should be in to see this step */
  requiredRole?: AppRole;
}

export interface Mission {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string; // lucide icon name
  targetRoles: AppRole[];
  steps: MissionStep[];
}

export const MISSIONS: Mission[] = [
  {
    id: "booking-lifecycle",
    titleKey: "simulation.missions.bookingLifecycle.title",
    descriptionKey: "simulation.missions.bookingLifecycle.description",
    icon: "BookOpen",
    targetRoles: ["front_desk", "front_desk_supervisor", "manager", "admin"],
    steps: [
      { title: "Step 1: New Inquiry", description: "A guest calls or messages. Front Desk creates a new booking in the Inquiry state. This logs the interest without commitment.", requiredRole: "front_desk" },
      { title: "Step 2: Soft Hold", description: "Front Desk advances the inquiry to Soft Hold. This temporarily reserves the dates (policy-defined expiration). The guest has time to decide." },
      { title: "Step 3: Pending Approval", description: "The booking moves to Pending Approval. A Manager or Admin reviews and approves or rejects the request.", requiredRole: "manager" },
      { title: "Step 4: Pending Deposit", description: "After approval, the guest must pay a deposit. The system tracks the deposit deadline. A Supervisor can record the payment.", requiredRole: "front_desk_supervisor" },
      { title: "Step 5: Confirmed", description: "Deposit received — the booking is confirmed! Pre-arrival checklist items (documents, arrival details) should now be completed." },
      { title: "Step 6: Check-In", description: "On arrival day, a Supervisor completes the check-in. ID documents must be uploaded first. If the cleaning buffer is violated, Manager approval is required.", requiredRole: "front_desk_supervisor" },
      { title: "Step 7: Checked In → Completed", description: "When the guest departs, a Supervisor completes check-out. The booking moves to Completed. A review invitation can be sent.", requiredRole: "front_desk_supervisor" },
      { title: "Complete!", description: "You've walked through the full booking lifecycle: Inquiry → Soft Hold → Pending Approval → Pending Deposit → Confirmed → Checked In → Completed. Each transition has role-based access controls." },
    ],
  },
  {
    id: "guest-self-service",
    titleKey: "simulation.missions.guestSelfService.title",
    descriptionKey: "simulation.missions.guestSelfService.description",
    icon: "User",
    targetRoles: ["guest"],
    steps: [
      { title: "Step 1: Browse Listings", description: "As a guest, you can browse available accommodations in the Listings tab. Each unit shows photos, amenities, pricing, and an availability calendar." },
      { title: "Step 2: Request a Booking", description: "Found your room? Click 'Request Booking' to submit an inquiry. Fill in your dates, guest count, arrival details, and any special requests." },
      { title: "Step 3: Upload Documents", description: "Before check-in, you'll need to upload ID documents. Navigate to your booking and use the ID tab to upload passport or ID photos." },
      { title: "Step 4: Pre-Arrival Checklist", description: "Complete the pre-arrival checklist: emergency contact, dietary restrictions, and arrival details. This helps staff prepare for your stay." },
      { title: "Step 5: Stay Support", description: "During your stay, use the Support tab to report room issues or request laundry service. Staff are notified automatically." },
      { title: "Step 6: Leave a Review", description: "After checkout, you can leave a review (available 24h after departure). Share your experience to help future guests!" },
      { title: "Complete!", description: "You've seen the full guest journey: Browse → Book → Documents → Pre-Arrival → Stay Support → Review. Everything is self-service through the Guest Portal." },
    ],
  },
  {
    id: "ask-kru-glitch",
    titleKey: "simulation.missions.askKruGlitch.title",
    descriptionKey: "simulation.missions.askKruGlitch.description",
    icon: "Bot",
    targetRoles: ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer", "guest"],
    steps: [
      { title: "Step 1: Open Kru Glitch", description: "Look for the Kru Glitch AI button in the bottom-right corner. This is your context-aware assistant that adapts to your current role." },
      { title: "Step 2: Role-Specific Knowledge", description: "Kru Glitch knows what you can and can't do. Admins can ask about system health. Managers get revenue insights. Front Desk sees today's schedule. Guests get booking info." },
      { title: "Step 3: Advisory Only", description: "Important: Kru Glitch never takes actions — it only advises. It won't create bookings or change states. You always make the final decision." },
      { title: "Step 4: Try Different Modes", description: "Use the mode selector: Explain (deep dive), Summary (quick overview), Validate (check your work), Draft (compose messages), Digest (daily briefing), Camp (local info)." },
      { title: "Complete!", description: "Kru Glitch is always available, role-aware, and advisory-only. Use it to get quick answers, draft messages, or understand platform features." },
    ],
  },
  // ── Phase B Missions ──
  {
    id: "first-contact",
    titleKey: "simulation.missions.firstContact.title",
    descriptionKey: "simulation.missions.firstContact.description",
    icon: "MessageSquare",
    targetRoles: ["front_desk", "guest"],
    steps: [
      { title: "Step 1: Guest Sends Inquiry", description: "A potential guest finds the listing and sends a message asking about availability and pricing. This appears in the Messages inbox.", requiredRole: "guest" },
      { title: "Step 2: Staff Receives Notification", description: "Front Desk sees an unread message notification. Open the Messages page to view the incoming inquiry.", requiredRole: "front_desk" },
      { title: "Step 3: Draft a Reply", description: "Use 'Draft with Kru' to compose a professional response with availability details and pricing. Review and personalize before sending." },
      { title: "Step 4: Guest Views Response", description: "The guest sees the staff reply in their portal. They can continue the conversation or proceed to request a booking.", requiredRole: "guest" },
      { title: "Step 5: Internal Note", description: "Staff adds an internal note (not visible to the guest) about the lead quality and any follow-up needed.", requiredRole: "front_desk" },
      { title: "Complete!", description: "You've completed the first contact flow: Guest inquiry → Staff response (with AI draft) → Guest follow-up → Internal notes. Messages support real-time translation across 9 languages." },
    ],
  },
  {
    id: "emergency-maintenance",
    titleKey: "simulation.missions.emergencyMaintenance.title",
    descriptionKey: "simulation.missions.emergencyMaintenance.description",
    icon: "Wrench",
    targetRoles: ["guest", "maintenance", "manager"],
    steps: [
      { title: "Step 1: Guest Reports Issue", description: "A guest discovers a problem in their room (e.g., leaking pipe, broken AC). They use the Stay Support tab to submit a maintenance request with category and priority.", requiredRole: "guest" },
      { title: "Step 2: Notification to Staff", description: "The maintenance team and manager receive an automatic notification. The request appears in the Maintenance Queue with priority level highlighted.", requiredRole: "maintenance" },
      { title: "Step 3: Acknowledge & Assess", description: "Maintenance staff opens the request, assesses the severity, and updates the status to 'In Progress'. They can add notes about the issue.", },
      { title: "Step 4: Resolution", description: "After fixing the issue, maintenance marks it as 'Resolved' with a resolution note describing the fix and any parts used." },
      { title: "Step 5: Manager Review", description: "The manager can review resolved requests, check resolution times, and identify recurring issues across units.", requiredRole: "manager" },
      { title: "Complete!", description: "Emergency maintenance flow complete: Guest report → Auto-notification → Maintenance acknowledges → Resolution logged → Manager reviews. All actions are timestamped in the Stay Support Log." },
    ],
  },
  {
    id: "laundry-run",
    titleKey: "simulation.missions.laundryRun.title",
    descriptionKey: "simulation.missions.laundryRun.description",
    icon: "Shirt",
    targetRoles: ["guest", "front_desk"],
    steps: [
      { title: "Step 1: Guest Submits Request", description: "A guest uses the Stay Support tab to request laundry service. They specify the number of bags and any special instructions (e.g., 'separate whites').", requiredRole: "guest" },
      { title: "Step 2: Staff Receives Request", description: "Front Desk sees the new laundry request in the Laundry Panel. The request shows the unit, bag count, and guest notes.", requiredRole: "front_desk" },
      { title: "Step 3: Pick Up & Process", description: "Staff updates the status to 'Received' when bags are collected. Then to 'In Progress' when washing begins." },
      { title: "Step 4: Ready for Return", description: "When laundry is done, staff marks it as 'Ready for Pickup'. The guest receives a notification that their laundry is ready." },
      { title: "Step 5: Delivered", description: "Staff delivers the laundry and marks the request as 'Delivered'. The full timeline is logged in the Stay Support Log." },
      { title: "Complete!", description: "Laundry service flow complete: Guest request → Staff pickup → Processing → Ready notification → Delivery. Each status change is timestamped and logged." },
    ],
  },
  {
    id: "revenue-check",
    titleKey: "simulation.missions.revenueCheck.title",
    descriptionKey: "simulation.missions.revenueCheck.description",
    icon: "BarChart3",
    targetRoles: ["manager", "admin"],
    steps: [
      { title: "Step 1: Open Reports", description: "Navigate to the Reports page. This is where managers and admins can view occupancy rates, revenue breakdowns, and booking trends.", requiredRole: "manager" },
      { title: "Step 2: Revenue Overview", description: "The dashboard shows total revenue, average nightly rate, and occupancy percentage. Compare current performance against previous periods." },
      { title: "Step 3: Unit Performance", description: "Drill into per-unit metrics. Which units generate the most revenue? Which have the highest occupancy? Identify underperforming units." },
      { title: "Step 4: Booking Funnel", description: "Analyze the booking funnel: How many inquiries convert to confirmed bookings? Where do guests drop off? This data informs pricing strategy.", requiredRole: "admin" },
      { title: "Step 5: Account Overview", description: "Review account activity — staff logins, role distribution, and new account creation trends. This helps manage team capacity." },
      { title: "Complete!", description: "Revenue check complete. Reports provide real-time visibility into occupancy, revenue, booking conversion, and account activity. Use this data to optimize pricing rules and staffing." },
    ],
  },
  {
    id: "staff-onboarding",
    titleKey: "simulation.missions.staffOnboarding.title",
    descriptionKey: "simulation.missions.staffOnboarding.description",
    icon: "UserPlus",
    targetRoles: ["admin"],
    steps: [
      { title: "Step 1: Navigate to Settings", description: "Go to Settings → Team Management. This is where admins manage staff accounts and role assignments.", requiredRole: "admin" },
      { title: "Step 2: Create Staff Account", description: "Click 'Create Staff Account' and fill in the new team member's email and temporary password. Choose their initial role (Front Desk, Maintenance, etc.)." },
      { title: "Step 3: Assign Role", description: "The role determines what pages and actions the staff member can access. Front Desk handles bookings and messages. Maintenance handles repair requests. Managers can approve bookings." },
      { title: "Step 4: Verify Access", description: "Use the Role Preview feature to verify what the new staff member will see. Switch to their role and confirm the correct pages and actions are available." },
      { title: "Step 5: Recommend Simulation", description: "Tell the new staff member about the War Room Simulation! They can practice their role's workflows with mock data before handling real guests." },
      { title: "Complete!", description: "Staff onboarding complete: Create account → Assign role → Verify access → Recommend training. The Role Preview and War Room Simulation ensure new staff are confident before going live." },
    ],
  },
  {
    id: "training-program",
    titleKey: "simulation.missions.trainingProgram.title",
    descriptionKey: "simulation.missions.trainingProgram.description",
    icon: "Dumbbell",
    targetRoles: ["front_desk", "front_desk_supervisor", "manager", "admin"],
    steps: [
      { title: "Step 1: Create Training Packages", description: "Admins define training packages in Settings → Training. Each package has a name, duration, and price (e.g., 'Beginner Muay Thai — 7 days — ฿5,000').", requiredRole: "admin" },
      { title: "Step 2: Link to Booking", description: "Open any booking and use the Training Program section to assign a package. Select the package, optionally set a trainer and start date." },
      { title: "Step 3: View in Sandbox", description: "The Training panel in the sandbox shows all active training links — which guests are training, with whom, and on what program." },
      { title: "Step 4: Guest Visibility", description: "Guests see their assigned training package in their portal, including trainer name and schedule details." },
      { title: "Complete!", description: "Training integration complete: Admin creates packages → Staff links to bookings → Guests see details. This connects accommodation with training operations." },
    ],
  },
];
