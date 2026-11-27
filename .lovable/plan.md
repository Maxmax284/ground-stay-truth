# CampStay Privacy, Security and Lamai Archives Readiness — Read-Only Audit

Scope: code, schema, storage and function definitions, cron metadata only. No guest records or files were opened, nothing was changed, no secrets read. "Observed" = seen in source/definitions. "Tested" = exercised by a run. Almost nothing here is tested.

## Executive verdict

- **Collect and store documents as designed: NOT READY. Needs a separate urgent review.** Storage is private and guests are walled to their own bookings. But staff access to identity scans has no property limit, a 7-day bearer link to ID files can land in chat, uploads have no file type or size limits, and the 90-day deletion job probably deletes nothing.
- **Share with Lamai Archives: NOT READY.** No connector exists, no record/version IDs, no hold or supersession model, and the reusable Vanta pattern sends events unsigned when the secret is missing.
- Not a legal finding. Retention periods, TM30 handling and the lawful basis are questions for management/counsel.

## 1. Corrections to the earlier ChatGPT notes

| Earlier claim | Current evidence |
|---|---|
| 90-day guest-doc deletion + 7-day orphans | Code matches (`supabase/functions/cleanup-storage/index.ts`). **But** it calls `list("")` on the bucket root, limit 500, no pagination. Files are saved under `<bookingId>/...` (`BookingDetailSheet.tsx:873`, guest storage policy folder check), so the root only returns folders. Folders have no `created_at` and are skipped. **Likely result: nothing is ever deleted.** Inferred from code, not tested. |
| Schedule not established | Cron `cleanup-storage-weekly` (`0 4 * * 0`, active), set in `drizzle/migrations/0043_security_hardening_nov10.sql:72`. Separate `cleanup-retention-daily` (`0 3 * * *`) purges logs (security_events 90d, booking_state_log 180d, email_log 90d), not files. |
| Errors / partial deletes | Storage remove, then DB row delete without checking the result. Errors are ignored. No holds, no audit record per deletion, no derivative cleanup (AI verification results, chat attachments, signed links already handed out). 90 days is hardcoded, not taken from policy settings. |
| vanta-dispatch: signing, idempotency, retry | Confirmed HMAC-SHA256 over `timestamp.body` with idempotency-key dedupe. **Pitfall:** if `vanta_webhook_secret` is missing it sends with an empty signature (`vanta-dispatch/index.ts:130-132`), so it does not fail closed. The secret comes from `integration_secrets`. Do not reuse it. |
| Buckets | Private: guest-documents, booking-confirmations, tax-invoices, maintenance-photos. **Public:** unit-photos, intelligence-images, app-downloads. **None of the 7 buckets has a MIME or size limit.** |

## 2. Access control findings (from definitions)

- **P0 Cross-property access to IDs.** `can_view_guest_documents()` checks role only (admin, manager, front_desk_supervisor, front_desk). There is no `has_property_access` check. It controls both the `guest_documents` table SELECT/UPDATE and the storage SELECT on `guest-documents`. Front desk staff at one property can read ID scans from every property, including the sandbox and production.
- **P0 Bearer link to ID files.** Chat attachment upload in `BookingDetailSheet.tsx:872-886` writes to the `guest-documents` bucket and puts a **7-day** signed URL into the message. Whoever has that URL can open the file, and it stays in the message history after the file should be gone. Compare `useGuestDocuments.ts:165` at 120s, which is correct. There is also a `getPublicUrl` fallback on a private bucket.
- **P1** Staff storage INSERT on guest-documents is allowed only for `front_desk`, but table INSERT uses `has_ops_write`. Admins also have ALL. The two layers don't line up. Managers can delete files and rows without a recorded reason.
- **P1** Generated confirmation and invoice links last 1 hour (`generate-booking-confirmation:431`, `generate-tax-invoice:107,247`). That's acceptable, but they're bearer links and their use isn't logged.
- **P1** `verify-document` sends ID images to the AI gateway (`google/gemini-2.5-flash`). This is an external processor and a cross-border transfer question. The result is advisory only. No opt-out or alternative manual path was observed.
- **P1** No malware scan, quarantine or type check on upload. `guest_document_access_log` exists, but its writes come from the client, so coverage depends on the UI.
- Guests are walled to their own bookings by `bookings.guest_id = auth.uid()` on the tables and storage (good). Manual guests with no account have no portal access, as intended.
- MFA/step-up: `MfaGate`/`DeviceGate` protect staff screens. The storage and RLS rules don't require MFA, so a valid staff session alone is enough. Untested.
- **Untested paths:** cross-property reads, guessing other files' existence through the folder path, expired-link behavior, cleanup at more than 500 objects, deletion of a manager's files.

## 3. Document-by-document eligibility for Archives

| Document | Decision | Safeguard |
|---|---|---|
| Final tax invoice (`tax_invoices` + PDF) | Share by reference, then pull after approval | Only issued/final versions. Voided invoices send a supersede event. |
| Booking confirmation (`booking_confirmation_log` + PDF) | Share by reference | Latest version only. Earlier versions are marked superseded. |
| Maintenance docs/photos | Configurable, off by default | Strip EXIF. No guest faces or room occupant details. |
| Passport/ID scans (`guest_documents`) | **Disabled** | Reference-only flag (e.g. "ID sighted on date") only after legal approval. Never the file. |
| Messages, chat attachments | Excluded | — |
| Payments, receipts, card data | Excluded. A total amount is allowed on the invoice only. | — |
| journey_evidence, consents, audit logs | Excluded for now | Revisit with counsel. |

## 4. Smallest connector design (proposal only)

```text
CampStay                                   Lamai Archives
archive_outbox (event rows) --signed--> inbox (dedupe by event_id)
archive_share_policy (per category, off)  pull: GET /archive-content?doc&ver
archive_property_map (explicit, prod only) <-- narrow token, 5-min link, logged
```
- Event fields: event_id, source, env, property_ref, document_id, doc_type, version, classification, policy_version, action (published/superseded/revoked/deleted/hold/release), occurred_at. **No PII.**
- Authoritative ID: `campstay:<table>:<uuid>:v<n>`, with an immutable version row per issued PDF.
- A dedicated secret per side. Fail closed when it's missing. Reject a timestamp older than 5 minutes or an event_id already seen. Retry with backoff and a dead-letter state. A daily reconciliation compares counts and hashes.
- The sandbox property can never map to production. The connector is off by default and makes no copy across borders unless an admin approves it.
- Admin setup: Connect → Test → Map property → Approve categories → Enable (Settings → App).

## 5. Priorities

**P0 — before any further ID collection review sign-off**
1. Add a property-scoped check to `can_view_guest_documents` (role + `has_property_access` via booking). Test: synthetic staff at property A get 0 rows and 0 objects from property B.
2. Move chat attachments out of `guest-documents` or cut the link to 120s and resolve it when viewed. Test: a stored message has no bearer link that lasts longer than 2 min.
3. Fix cleanup: list recursively with pagination, check each error, keep an audit row per deletion, honor a hold flag. Test: a synthetic expired file at depth 2 is deleted, a held file is kept, and run 501+ objects.
4. Add MIME allowlist and size limits on the private buckets.

**P1 — before the connector**
- Retention period comes from approved policy settings, not hardcoded. Server-side access logging for document reads. Opt-out of AI ID verification plus a manual path. A legal hold model. Make Vanta-style signing fail closed. Immutable version rows for confirmations and invoices.

**P2**
- EXIF stripping, existence-disclosure hardening, a staff dashboard for deletion requests.

**Connector acceptance tests (synthetic data only):**
- Duplicate, out-of-order, forged and replayed events are all rejected or deduped.
- Revoke/delete propagates within the SLA.
- Archives down for 24h leaves CampStay unaffected, and the outbox drains.
- Rollback = disable flag plus revoke token.

## 6. Human approval gates
1. Management: the retention period per document type and the hold owner.
2. Counsel: lawful basis for ID collection and TM30 handling, AI processing of IDs, cross-border transfer, Archives eligibility of IDs.
3. Admin: P0 fix rollout (separate approval).
4. Admin plus Archives owner: connector contract v1, then enable per category.

## 7. Addendum for the Lamai Archives planning agent
- CampStay is the source of truth. Archives stores references and approved PDFs only and never writes back.
- Build: a signed inbox with event_id dedupe and a 5-minute replay window. A per-property mapping (production only). Version supersession. Revocation and deletion that remove the content and keep a tombstone. Holds that block deletion. Restricted classes are excluded from external AI.
- Do not expect IDs, messages or payment data. Use a dedicated credential, never shared.
- Wait for CampStay P0 items 1-3 and gates 1-2 before going live.
- Owner/legal decisions: retention, ID reference policy, transfer region, who approves categories.

## Unknowns
Hosting region of storage and backups, whether backups keep deleted files, the AI gateway's data retention terms, the TM30 workflow (no code found beyond checklist mentions), and actual cleanup run results (no run log is recorded).
