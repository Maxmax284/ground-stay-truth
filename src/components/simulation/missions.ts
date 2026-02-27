/**
 * War Room Simulation — Mission Definitions (Phase A)
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
      {
        title: "Step 1: New Inquiry",
        description: "A guest calls or messages. Front Desk creates a new booking in the Inquiry state. This logs the interest without commitment.",
        requiredRole: "front_desk",
      },
      {
        title: "Step 2: Soft Hold",
        description: "Front Desk advances the inquiry to Soft Hold. This temporarily reserves the dates (policy-defined expiration). The guest has time to decide.",
      },
      {
        title: "Step 3: Pending Approval",
        description: "The booking moves to Pending Approval. A Manager or Admin reviews and approves or rejects the request.",
        requiredRole: "manager",
      },
      {
        title: "Step 4: Pending Deposit",
        description: "After approval, the guest must pay a deposit. The system tracks the deposit deadline. A Supervisor can record the payment.",
        requiredRole: "front_desk_supervisor",
      },
      {
        title: "Step 5: Confirmed",
        description: "Deposit received — the booking is confirmed! Pre-arrival checklist items (documents, arrival details) should now be completed.",
      },
      {
        title: "Step 6: Check-In",
        description: "On arrival day, a Supervisor completes the check-in. ID documents must be uploaded first. If the cleaning buffer is violated, Manager approval is required.",
        requiredRole: "front_desk_supervisor",
      },
      {
        title: "Step 7: Checked In → Completed",
        description: "When the guest departs, a Supervisor completes check-out. The booking moves to Completed. A review invitation can be sent.",
        requiredRole: "front_desk_supervisor",
      },
      {
        title: "Complete!",
        description: "You've walked through the full booking lifecycle: Inquiry → Soft Hold → Pending Approval → Pending Deposit → Confirmed → Checked In → Completed. Each transition has role-based access controls.",
      },
    ],
  },
  {
    id: "guest-self-service",
    titleKey: "simulation.missions.guestSelfService.title",
    descriptionKey: "simulation.missions.guestSelfService.description",
    icon: "User",
    targetRoles: ["guest"],
    steps: [
      {
        title: "Step 1: Browse Listings",
        description: "As a guest, you can browse available accommodations in the Listings tab. Each unit shows photos, amenities, pricing, and an availability calendar.",
      },
      {
        title: "Step 2: Request a Booking",
        description: "Found your room? Click 'Request Booking' to submit an inquiry. Fill in your dates, guest count, arrival details, and any special requests.",
      },
      {
        title: "Step 3: Upload Documents",
        description: "Before check-in, you'll need to upload ID documents. Navigate to your booking and use the ID tab to upload passport or ID photos.",
      },
      {
        title: "Step 4: Pre-Arrival Checklist",
        description: "Complete the pre-arrival checklist: emergency contact, dietary restrictions, and arrival details. This helps staff prepare for your stay.",
      },
      {
        title: "Step 5: Stay Support",
        description: "During your stay, use the Support tab to report room issues or request laundry service. Staff are notified automatically.",
      },
      {
        title: "Step 6: Leave a Review",
        description: "After checkout, you can leave a review (available 24h after departure). Share your experience to help future guests!",
      },
      {
        title: "Complete!",
        description: "You've seen the full guest journey: Browse → Book → Documents → Pre-Arrival → Stay Support → Review. Everything is self-service through the Guest Portal.",
      },
    ],
  },
  {
    id: "ask-kru-glitch",
    titleKey: "simulation.missions.askKruGlitch.title",
    descriptionKey: "simulation.missions.askKruGlitch.description",
    icon: "Bot",
    targetRoles: ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer", "guest"],
    steps: [
      {
        title: "Step 1: Open Kru Glitch",
        description: "Look for the Kru Glitch AI button in the bottom-right corner. This is your context-aware assistant that adapts to your current role.",
      },
      {
        title: "Step 2: Role-Specific Knowledge",
        description: "Kru Glitch knows what you can and can't do. Admins can ask about system health. Managers get revenue insights. Front Desk sees today's schedule. Guests get booking info.",
      },
      {
        title: "Step 3: Advisory Only",
        description: "Important: Kru Glitch never takes actions — it only advises. It won't create bookings or change states. You always make the final decision.",
      },
      {
        title: "Step 4: Try Different Modes",
        description: "Use the mode selector: Explain (deep dive), Summary (quick overview), Validate (check your work), Draft (compose messages), Digest (daily briefing), Camp (local info).",
      },
      {
        title: "Complete!",
        description: "Kru Glitch is always available, role-aware, and advisory-only. Use it to get quick answers, draft messages, or understand platform features.",
      },
    ],
  },
];
