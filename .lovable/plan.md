# CampStay Document Security Repair Plan (security-only, gated)

Based on the 27 Nov 2026 audit. The findings come from reading code and settings. They are not proof that anyone got in. Lamai Archives stays separate and its connection stays off. Nothing in this plan runs until each gate below is approved separately.

## Executive summary
Guest ID files are private and guests can only see their own. The weak spots are on the staff side and in maintenance:
- Any desk staff member can see IDs from every property.
- Chat attachments carry week-long open links.
- The 90-day cleanup almost certainly does nothing.
- Uploads accept any file of any size.
- ID photos go to an outside AI service.

All of these can be fixed with small, targeted changes. Nothing needs rebuilding.

**Key fact:** preview and live share one database. Every test therefore has to use synthetic data in a separate test backend or local fixtures. Never test on live data.

## 1. Immediate containment (ranked by risk ÷ effort)

| # | Action | Who can do it | Business impact |
|---|---|---|---|
| C1 | Pause AI ID verification behind an "off" switch. Staff check IDs by eye and tick "verified manually". TM30 and check-in stay unchanged. | Lovable, after approval | Low. A few extra seconds per guest. |
| C2 | Limit ID viewing to staff assigned to the booking's property, for both the file list and the files. | Lovable, after approval and a test pass | Low. Multi-property admins keep access through their property assignments. |
| C3 | Stop creating new 7-day links. New attachments get a short link each time someone opens them. | Lovable, after approval | None that's visible. |
| C4 | Count existing message attachments that point into guest-documents. Count only, no content read. | Lovable, after approval for the metadata query | None |
| C5 | Review access logs for unusual cross-property ID views. Only appropriately authorized metadata, starting from the existing access log and storage logs, after evidence is kept. | Owner authorizes; a security professional reviews if needed | None |
| C6 | Tell management and keep the evidence: export the current policy and function definitions plus log snapshots before any change. | Owner / Lovable | None |

**Owner/counsel decisions, not Lovable's:** whether a breach-notification assessment is needed, whether to keep the AI provider, the retention period, and the legal basis for collecting IDs.

## 2. P0 work packages

**WP1 — Property-scoped ID access**
- Change `can_view_guest_documents(_user_id)` to `can_view_guest_document(_user_id, _booking_id)`. It checks the role AND `has_property_access` for the booking's property, and denies sandbox↔production crossover.
- Update these to use it: `guest_documents` SELECT/UPDATE, `guest_document_access_log` SELECT/INSERT, storage `Staff can view guest documents`. Storage resolves the booking from the first folder name.
- Manual bookings use the same booking→property path, so there's no special case.
- Rollback: restore the earlier definition *only* if legitimate staff are locked out. The fallback is a stricter admin-only policy, never role-only.

**WP2 — Chat attachment links**
- `src/components/BookingDetailSheet.tsx:872-886`: store the file path, not the signed URL, and drop the `getPublicUrl` fallback.
- The message renderer creates a 120-second link when someone opens the file, as `useGuestDocuments.ts:165` does.
- Old messages: run the C4 count first. Links signed under the current project key can't be revoked one by one. The options are to (a) wait for them to expire (max 7 days from creation), or (b) move the file to a new path so the old link points at nothing. Mark each case "unverified" until checked. Never claim old links are revoked without per-file evidence.

**WP3 — Cleanup made honest (dry-run first)**
- `supabase/functions/cleanup-storage/index.ts`: walk folders recursively with pagination and check every remove result.
- Delete the database row only after the file is confirmed removed. Write one audit row per action.
- Add `mode=dry_run` as the default. It returns counts only: files found, eligible, held, orphaned.
- Add a legal-hold flag on `guest_documents` (or a holds table). Held items are never deleted.
- Retention days come from approved policy settings instead of hardcoded 90 and 7. If no value is approved, the job only counts and deletes nothing. Retention is not silently extended forever: the dry-run report shows overdue counts for the owner to decide.
- Cron `cleanup-storage-weekly` runs in dry-run until disposal is approved. Disposal runs in stages: a small batch first, then everything.

**WP4 — Upload limits and quarantine**
- Use bucket settings on the private buckets:
  - guest-documents: JPEG/PNG/WebP/HEIC/PDF, 10MB.
  - maintenance-photos: images, 10MB.
  - tax-invoices and booking-confirmations: PDF only.
- Client and server check the file signature (magic bytes).
- New uploads start as `pending_scan`. Staff see them only after a type check passes. A full malware scanner is a P1 decision because it is an external processor.

**WP5 — AI ID processing gate**
- `supabase/functions/verify-document`: refuse unless the switch `id_ai_verification_enabled` is on. Default is off.
- UI: a "Verify manually" button records who checked and when.
- Counsel reviews processor terms, region, retention and transfer before any switch-on.

## 3. P1 work packages
- Line up insert and delete policies: staff upload uses `has_ops_write` + property, and deletes require a reason and leave an audit row.
- Server-side access logging: document views go through one small function that creates the link and writes the log, so logging no longer relies on the client.
- 1-hour PDF links: shorten to 5 min and log each issue.
- Server-side MFA: require a recent MFA session for ID reads in the policy or function. Today it's UI only.
- Vanta: return an error and log `blocked_missing_secret` when the secret is missing. Keep the outbox and logs. Don't re-sign old events.
- Immutable versions for confirmations and invoices: this prepares for a connector later, but no connector is built now.
- Out of scope unless separately approved: reservations, pricing, rooms, Stripe and payments, customer design.

## 4. Test matrix (synthetic data, isolated test backend or local fixtures)

| Area | Pass criterion |
|---|---|
| Guest own docs | Upload and view still work. Another guest's booking returns 0 rows and 0 objects. A file that exists and one that doesn't give the same response. |
| Staff isolation | Property-A front desk sees 0 from property B and the sandbox. Admin with both assignments sees both. Manual booking follows its property. |
| Service role / cron | Internal jobs still work. Calls without an internal token get 401. |
| Links | New attachment link is dead after 120s. No message row stores a URL longer than the path. |
| MFA (P1) | ID read without a recent MFA session is denied by the server. |
| Uploads | .exe, an oversized file and a wrong magic-byte file are all rejected. A valid file is accepted as pending_scan. |
| Cleanup | Dry-run counts files at depth 2 across 501+ synthetic files. A held file is never touched. If the file removal fails, the row is kept and the failure is logged. |
| AI gate | Switch off: 0 calls to the outside service and the manual path works. |
| Vanta | Missing secret: 0 unsigned sends. Configured secret: approved flow passes. |

**Go/no-go:** every row passes in the test environment, the database linter shows no new findings, and the security scan is re-run.

**What Lovable can verify:** policies, tests, linter, scan, synthetic flows.
**Needs humans:**
- Nikki's real check-in walkthrough
- Penetration test by a security professional
- Legal retention, AI and transfer decisions by counsel

## 5. Approval gates (each separate)
1. **G1 Containment:** C1, C3, C4 count, C6 evidence snapshot.
2. **G2 Test-environment build:** WP1–WP5 on an isolated backend or local fixtures.
3. **G3 Production migrations:** WP1 and WP4 policies, rolled out during a quiet hour with the preserved definitions exported.
4. **G4 Production code:** WP2, WP3 (dry-run only), WP5.
5. **G5 Any deletion:** needs an approved retention policy and a staged batch.
6. **G6 Old-link remediation:** per the C4 results.
7. **G7 Any Archives connector:** later, separate.

**Rollback rule:** fix forward, or fall back to stricter access. Never fall back to role-only access. No destructive rollback, and logs and evidence are never deleted.

## Owner decisions needed
- Pause AI ID checks now? (recommended: yes)
- Retention period per document type, and who can place holds
- Whether to commission a log review and breach-notification assessment
- Whether to set up an isolated test backend
- Malware scanner choice
