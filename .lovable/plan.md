

# Ground Stay -- Full Platform Test Checklist and Final Audit

## Overview

This is a phased test plan covering every flow, component, AI layer, and integration across the Ground Stay platform. After each phase, I will report results in plain English so you know exactly what passed, what failed, and what needs fixing.

---

## Phase 1: Currency and Localization

**What we're testing:** Every price display across the platform uses the dynamic currency from policy_settings (currently THB / baht), not hardcoded symbols.

| # | Test | Where |
|---|------|-------|
| 1.1 | Guest portal listing cards show baht symbol | Guest Portal > Listings tab |
| 1.2 | Booking form price breakdown shows baht | Guest Portal > Request Booking dialog |
| 1.3 | Booking state transition deposit amounts show baht | Staff dashboard > Booking detail > State Transition |
| 1.4 | Refund preview on cancellation shows baht | Staff dashboard > Cancel transition |
| 1.5 | Reports revenue chart axis and tooltips show baht | Reports > Operations tab |
| 1.6 | Embed widgets show baht | /embed/listing, /embed/compact, /embed/cta |

**Known issue found during audit:** The EmbedWidget (`src/pages/EmbedWidget.tsx`) still has **hardcoded baht symbols** on lines 142, 146, 183, and 236. It doesn't use the `formatPrice` utility or read from policy_settings. This means if you ever change the currency, the embeds won't update. This needs to be fixed -- the embed should either call the availability endpoint with currency info, or accept currency as a URL parameter.

---

## Phase 2: Booking State Machine (Full 9-State Lifecycle)

**What we're testing:** Every state transition, guard, and audit log.

| # | Test |
|---|------|
| 2.1 | Guest submits inquiry -- state = "inquiry", audit log created |
| 2.2 | Staff approves -- inquiry to pending_approval to pending_deposit |
| 2.3 | Deposit recorded (cash) -- pending_deposit to confirmed, payment logged |
| 2.4 | Check-in with document uploaded -- confirmed to checked_in |
| 2.5 | Check-in blocked without document (no admin override) |
| 2.6 | Check-in with cleaning buffer violation -- blocked unless early check-in approved |
| 2.7 | Early check-in request created and approved by manager |
| 2.8 | Check-out -- checked_in to completed |
| 2.9 | Cancellation with free refund (7+ days out) |
| 2.10 | Cancellation with partial refund (3-7 days) |
| 2.11 | Cancellation with no refund (under 72 hours) |
| 2.12 | Admin override toggle unlocks all transitions |
| 2.13 | Overlap protection -- two bookings for same unit same dates rejected |
| 2.14 | Booking confirmation edge function fires on confirmed transition |

---

## Phase 3: Deposit and Payment System

| # | Test |
|---|------|
| 3.1 | Manual deposit (cash/card/bank transfer) recorded by supervisor+ |
| 3.2 | Online required mode blocks confirmation without payment |
| 3.3 | Manager override for online-required mode -- logged with reason |
| 3.4 | Source channel tracked (front_desk, guest_portal, supervisor_override) |
| 3.5 | Deposit percentage applied correctly from policy_settings |

---

## Phase 4: Role-Based Access (All 7 Roles)

| # | Role | Expected Access |
|---|------|----------------|
| 4.1 | Guest | Own bookings, own messages, own documents, stay support, profile |
| 4.2 | Viewer | Read-only dashboards, reports (no transitions) |
| 4.3 | Maintenance | Maintenance queue only, update status |
| 4.4 | Front Desk | Bookings, messages, documents -- no payments, no check-in/out |
| 4.5 | Supervisor | Front desk + payments + check-in/out |
| 4.6 | Manager | Supervisor + policy changes + early check-in approvals + deposit overrides |
| 4.7 | Admin | Everything, including admin overrides and user role management |

---

## Phase 5: AI Layer (Kru) -- All 6 Modes

| # | Mode | Test |
|---|------|------|
| 5.1 | Explain | Ask "What is a soft hold?" -- get a concise, accurate answer |
| 5.2 | Summarize | Ask for an operational summary -- returns live snapshot data |
| 5.3 | Validate | Select a state transition -- pre-flight check fires with advisory |
| 5.4 | Draft | Ask to draft a message -- returns natural language draft |
| 5.5 | Digest | Request daily digest -- includes staleness detection for 24h+ items |
| 5.6 | Camp | Ask "What's the training schedule?" -- pulls from camp_info policy |
| 5.7 | Circuit breaker -- disable ai_assistant_enabled, verify panel disappears |
| 5.8 | Per-role circuit breaker -- disable ai_front_desk_enabled, verify front desk can't use Kru |
| 5.9 | Language switching -- change response language to Thai, verify response in Thai |

---

## Phase 6: Notifications

| # | Test |
|---|------|
| 6.1 | Booking state change triggers notification to relevant users |
| 6.2 | Deposit recorded triggers notification |
| 6.3 | Manager override triggers admin notification |
| 6.4 | Maintenance request triggers notification to maintenance role |
| 6.5 | Laundry request triggers notification |
| 6.6 | Notification bell shows unread count |
| 6.7 | Marking notification as read clears the count |
| 6.8 | Realtime -- new notification appears without page refresh |

---

## Phase 7: Guest Portal

| # | Test |
|---|------|
| 7.1 | Listing cards display unit photos, amenities, pricing in baht |
| 7.2 | Booking form collects guest_type (fighter/training_guest/spectator/long_term) |
| 7.3 | Booking form collects arrival details (flight, arrival time, emergency contact, dietary) |
| 7.4 | Camp Info tab shows configured camp_info from policy_settings |
| 7.5 | Policies tab shows check-in time (16:00) and check-out time (11:00) |
| 7.6 | Messages tab with realtime, inline translation |
| 7.7 | Stay Support tab appears only during checked_in state |
| 7.8 | Cancellation dialog shows refund preview with correct tier |
| 7.9 | Document upload works for ID verification |
| 7.10 | Profile editor saves WhatsApp and LINE ID |

---

## Phase 8: Internationalization (i18n)

| # | Test |
|---|------|
| 8.1 | Switch to Thai -- all UI labels translate |
| 8.2 | Switch to German -- all UI labels translate |
| 8.3 | Switch to French -- all UI labels translate |
| 8.4 | Language preference persists via localStorage |
| 8.5 | Kru responds in selected language |
| 8.6 | Message translation (inline) works |

---

## Phase 9: Automated Expiration

| # | Test |
|---|------|
| 9.1 | Call expire-stale-bookings edge function -- returns success with count |
| 9.2 | Soft hold older than 12 hours gets cancelled with [SYSTEM] audit log |
| 9.3 | Pending deposit older than 24 hours (no payment) gets cancelled |
| 9.4 | Pending deposit with existing payment is NOT cancelled |

---

## Phase 10: Embed Widgets

| # | Test |
|---|------|
| 10.1 | /embed/listing/:unitId renders full listing with calendar |
| 10.2 | /embed/compact/:unitId renders compact card |
| 10.3 | /embed/calendar/:unitId renders availability calendar |
| 10.4 | /embed/cta/:unitId renders call-to-action |
| 10.5 | Blocked dates show red on calendar |
| 10.6 | "Book Now" link points to guest auth portal |

---

## Phase 11: Reports

| # | Test |
|---|------|
| 11.1 | Occupancy chart renders with day-by-day data |
| 11.2 | Revenue by unit shows bar chart with baht formatting |
| 11.3 | Booking state distribution pie chart renders |
| 11.4 | Blocked vs bookable stacked bar renders |
| 11.5 | Month navigation works (previous/next) |
| 11.6 | Accounts tab shows role distribution and activity (admin/manager/viewer only) |

---

## Phase 12: Edge Functions

| # | Function | Test |
|---|----------|------|
| 12.1 | get-availability | Returns unit data and blocked ranges for embeds |
| 12.2 | ai-assistant | Responds with streamed SSE in all 6 modes |
| 12.3 | expire-stale-bookings | Cancels overdue soft holds and deposits |
| 12.4 | send-booking-confirmation | Creates notification on confirmed transition |
| 12.5 | create-staff-account | Creates account with assigned role |
| 12.6 | delete-account | Removes user and associated data |
| 12.7 | translate-message | Returns translated text |
| 12.8 | verify-document | Processes uploaded document verification |
| 12.9 | account-census | Returns account overview for reports |

---

## Critical Gap Found During This Audit

**Embed Widget Currency Hardcoding:** The embed widget (`EmbedWidget.tsx`) has `฿` hardcoded in 4 places instead of using the dynamic currency system. The main app correctly uses `formatPrice()` everywhere, but the embeds bypass it because they don't have access to React hooks (they fetch data from the `get-availability` edge function). The fix is to include currency_symbol in the `get-availability` response and use it in the embed rendering.

---

## WhatsApp Integration -- How It Works

Here's the full picture on WhatsApp, since you asked:

**Current state:** The profile table has `whatsapp` and `line_id` fields. Guests can enter their WhatsApp number and LINE ID in their profile. Staff can see these fields in the booking detail sheet. Right now, this is manual -- staff sees the number and messages the guest directly from their own phone.

**How automated WhatsApp would work:**
1. You sign up for the WhatsApp Business API through a provider like Twilio or Meta's Cloud API directly
2. You get an API key and a verified WhatsApp Business number
3. An edge function is created that sends templated messages (booking confirmed, check-in reminder, deposit deadline) via that API
4. The API key gets stored as a secret in Lovable Cloud (same place other secrets live)
5. The edge function fires on specific booking transitions -- same pattern as the existing `send-booking-confirmation` function

**For guests:** They don't need to do anything special. If they provide their WhatsApp number in their profile, they receive messages on that number. Standard WhatsApp -- no app install, no signup, nothing extra.

**For admins:** In Settings, there would be a toggle to enable/disable WhatsApp notifications (same pattern as the AI circuit breakers). The API key setup is a one-time thing done through the Lovable Cloud secrets panel -- you paste the key, and it's stored securely. Same flow as any other API integration.

**LINE works the same way** but uses the LINE Messaging API instead of Twilio. Same pattern: API key, edge function, templated messages.

**Cost:** WhatsApp Business API charges per conversation (roughly $0.01-0.08 per conversation depending on region). LINE is free for the first 200 messages/month on their free tier. Both are negligible for a single-property operation.

This is a Phase 2 item -- the manual contact fields are already in place and working for Phase 1.

---

## Execution Plan

I will run these tests phase by phase using the browser tools, checking each item against the live preview. After each phase, I'll report what passed and what didn't. At the end, I'll give you the full summary with my verdict.

The one code fix I'll make during testing: updating the embed widget to use dynamic currency from the availability endpoint instead of hardcoded symbols.

