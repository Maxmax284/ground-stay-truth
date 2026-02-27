

# War Room Simulation -- Full Platform Training Environment

## Overview

A dedicated **Simulation Mode** accessible from every role (staff and guest) that combines three training layers: an interactive sandbox with mock data, guided scenario walkthroughs, and a visual platform map showing the full role/feature matrix.

## How It Works

### Entry Point

- New route: `/simulation` (accessible to all authenticated users)
- Entry button added to:
  - **Staff sidebar** (below the role preview selector) -- labeled "War Room Sim"
  - **Guest portal header** -- labeled "Platform Guide"
  - **Settings page** -- "Launch Training Simulation" button
- The simulation runs entirely client-side using **mock data generators** -- no real database reads/writes. This means users can click through every workflow without touching production data.

### Three Simulation Layers

**Layer 1: Platform Map (Command Center)**

A visual overview page showing the entire platform architecture:

- Left column: Role hierarchy displayed as a vertical tier list (Guest through Admin), each role card expandable to show:
  - Which pages they can access
  - Which actions they can perform (create bookings, approve, manage units, etc.)
  - What Kru Glitch AI can answer for them
- Right column: Feature matrix grid -- pages on one axis, roles on the other, with checkmarks/icons showing access
- Clickable nodes: tapping any feature cell launches the relevant scenario walkthrough

**Layer 2: Interactive Demo Mode (Sandbox)**

A simulated version of the platform using entirely mock data:

- Mock data factory generates: 4 units, 12 bookings across all 9 states, 3 maintenance requests, 2 laundry requests, sample messages, mock payments, and fake guest documents
- Users can switch between any role using a persistent **Role Switcher Bar** at the top of the simulation (similar to the existing Admin role preview, but available to everyone in sim mode)
- All CRUD operations (create booking, approve, transition states, send messages) work against an **in-memory store** (React state/context) -- nothing hits the database
- The sidebar, dashboard, and all pages render with filtered mock data based on the selected simulation role
- A persistent "SIMULATION MODE" banner (red/orange) makes it unmistakable that this is not live

**Layer 3: Guided Scenarios (Missions)**

Step-by-step interactive walkthroughs that teach specific workflows:

| Mission | Target Roles | Steps |
|---------|-------------|-------|
| "First Contact" | Front Desk, Guest | Guest submits inquiry -> Staff responds -> Guest views response |
| "Booking Lifecycle" | Front Desk, Supervisor, Manager | Inquiry -> Approve -> Deposit -> Confirm -> Check-in -> Check-out -> Complete |
| "Emergency Maintenance" | Guest, Maintenance, Manager | Guest reports issue -> Maintenance assigned -> Resolution logged |
| "Laundry Run" | Guest, Front Desk | Guest submits laundry -> Staff updates status through completion |
| "Revenue Check" | Manager, Admin | Navigate to Reports -> Interpret occupancy and revenue data |
| "New Staff Onboarding" | Admin | Create staff account -> Assign role -> Verify access |
| "Ask Kru Glitch" | All roles | Open AI panel -> See example prompts for your role -> Understand what AI can/cannot do |
| "Guest Self-Service" | Guest | Browse listings -> Request booking -> Upload documents -> Pre-arrival checklist |

Each mission uses a **spotlight/tooltip overlay** (building on the existing TutorialOverlay pattern) that highlights the relevant UI element and provides instruction text. Progress is tracked per-user in localStorage (not the database -- this is training, not onboarding).

### Guest-Side Adaptation

When a guest enters the simulation:
- They see the Platform Map filtered to guest-relevant features only
- The Role Switcher is hidden (guests only see guest perspective)
- Missions are filtered to guest-applicable ones
- The sandbox shows a mock guest portal with sample bookings they can interact with

### Staff-Side Adaptation

When staff enter:
- Full Platform Map with all roles visible
- Role Switcher lets them experience any role (leveraging the existing `useRolePreview` pattern but against mock data)
- All missions available, with their current role's missions highlighted as "recommended"

## Technical Approach

### New Files

1. **`src/pages/Simulation.tsx`** -- Main simulation page with tab navigation between the 3 layers
2. **`src/components/simulation/PlatformMap.tsx`** -- Visual role/feature matrix
3. **`src/components/simulation/SimulationSandbox.tsx`** -- Mock data sandbox wrapper
4. **`src/components/simulation/MissionRunner.tsx`** -- Scenario walkthrough engine with spotlight overlay
5. **`src/components/simulation/SimulationContext.tsx`** -- React context providing mock data store, simulated role, and mission state
6. **`src/components/simulation/mockData.ts`** -- Mock data factory (units, bookings, messages, etc.)
7. **`src/components/simulation/missions.ts`** -- Mission definitions with step sequences

### Modified Files

1. **`src/App.tsx`** -- Add `/simulation` route (protected, all roles)
2. **`src/components/AppSidebar.tsx`** -- Add "War Room Sim" nav link
3. **`src/components/GuestLayout.tsx`** -- Add "Platform Guide" entry point
4. **`src/lib/permissions.ts`** -- Add `/simulation` to NAV_ACCESS for all roles
5. **`src/i18n/locales/en.json`** (and all locale files) -- Add simulation-related i18n keys

### No Database Changes

Everything runs client-side with mock data. Mission progress stored in localStorage. No new tables, no migrations.

## Implementation Sequence

1. Create mock data factory and simulation context
2. Build the Platform Map (role/feature visual overview)
3. Build the Sandbox wrapper with in-memory CRUD
4. Build the Mission Runner engine with spotlight overlay
5. Define all 8 mission scripts
6. Wire up entry points (sidebar, guest layout, route)
7. Add i18n keys across all 9 locale files

## Scope Consideration

This is a large feature. A practical approach would be to ship in two phases:

- **Phase A**: Platform Map + 3 core missions (Booking Lifecycle, Guest Self-Service, Ask Kru Glitch) -- delivers immediate training value
- **Phase B**: Full sandbox mode + remaining 5 missions -- the interactive playground

