# G2 isolated document-security repair candidates

Authorization: isolated development only, 27 November 2026. **No production repair has been activated.**

## Boundaries

- No changes to application components, deployed functions, database schema/RLS, buckets, cron, credentials, guest records or external integrations.
- These modules have **no live adapter**, environment reads, network calls, or application imports. Only synthetic tests import them.
- No live storage listing or log queries. No real documents opened. No retention/disposition action performed.
- Local fixture tests are not database RLS tests and do not demonstrate absence of a breach.
- Archives is not implemented or connected.

## Prepared candidates

| Package | Local candidate | Future integration points — NOT modified |
|---|---|---|
| WP1 | `access.ts`: role + explicit property assignment + environment + staff AAL2 checks; clean-object read guard; same not-found response for unauthorized/missing | Existing `can_view_guest_documents`, guest document table/storage/access-log policies; authenticated, server-derived actor adapter |
| WP2 | `access.ts`: reference-only message attachments, 120-second signing request, audit-before-sign | `BookingDetailSheet.tsx`, guest/staff message renderers, `useGuestDocuments.ts`, additive attachment-reference schema |
| WP3 | `cleanup.ts`: recursive paginated inventory; default counts-only dry-run; approved expiring policy; holds; bounded staged disposition; checked removal and existence confirmation; partial-failure stop | `cleanup-storage`, approved hold/policy/audit schema and weekly cron dry-run mode |
| WP4 | `access.ts`: 10MB candidate cap; MIME/header agreement; bucket-category restriction; pending-scan gate | Bucket configuration via Storage API, authoritative ingestion function, authenticated quarantine storage and vetted parser/scanner |
| WP5 | `verification.ts`: default-off, processor/legal approval gates, manual attribution | `verify-document`, upload hook's unconditional AI invocation, existing manual review/TM30 hooks |
| P1 | `verification.ts`: missing-secret blocks existing dispatch and retains queue intent | `vanta-dispatch`: preserve event ID, existing envelope, allowlist, retries and log history when adding the guard |

### Corrections and limitations to the earlier audit/plan

1. **Manual paths exist in source.** `useReviewGuestDocument()` records review status/actor/time; `useMarkDocumentTm30()` records the TM30 operational flag (`src/hooks/useGuestDocuments.ts`). Preserve these rather than adding a competing workflow. Their authenticated UI/device behavior has not been tested here.
2. The verification function already declares a MIME allowlist and 10MB cap. This is not equivalent to bucket-wide upload protection; no bucket settings were changed.
3. The 120-second link test verifies the signing argument, **not actual expiry or revocation in storage**. Historical message URLs were not queried, changed or revoked. Private-bucket status does not revoke an already signed URL.
4. Header checks do not prove a file is safe. No real scanner/parser was installed or contacted. Release requires independent clean parser/malware results. HEIC is deliberately rejected in this candidate until a vetted decoder is chosen; owner approval/manual alternative is required before rollout. Existing physical/manual check-in must not depend on scan availability.
5. Actor roles, assignments, environment and MFA in tests are synthetic. Production must derive them from validated auth and protected rows. AAL2 proves assurance level, not recency: recent-step-up semantics remain a separate adapter/policy requirement.
6. Service-role clients bypass RLS. Do not grant user-facing reads through a service-role adapter before explicit actor authorization. Cron/internal callers must continue through `_shared/internalAuth.ts`; this candidate does not retest that deployed helper.
7. The old helper's signature must remain compatible until all consumers are inventoried; an additive booking-aware helper is safer than globally replacing it. PostgreSQL permissive policies combine with OR: replace or constrain every broad path, including admin ALL and manager DELETE, not just the named SELECT policy. Server-side row/field guards must prevent moving a document to another booking or spoofing review attribution.
8. The cleanup recheck models a hold arriving before removal. It is **not an atomic legal-hold guarantee**. Production needs a disposition lease/transactional hold guard, stable pagination or a durable inventory snapshot, reference completeness, and reconciliation for file-removed/row-kept partial failures. Missing/incomplete reference reads must abort orphan classification.
9. Legacy 90/7-day windows appear only in fabricated test policy input. They are not approved retention periods. Expired/missing policy blocks disposal and produces review counts; management must set a finite review/disposition deadline instead of silently retaining indefinitely.
10. A failed dispatcher guard must preserve the durable event row and original event ID/attempts; the synthetic queue adapter is not a new outbox implementation. Existing retry/idempotency behavior still needs isolated integration tests.

## Test evidence

Run from the project root:

```text
bunx vitest run src/lib/__tests__/documentSecurityG2.test.ts \
  src/lib/__tests__/guestAccountPreservation.test.ts \
  src/lib/__tests__/guestDisplay.test.ts \
  src/lib/__tests__/arrivalRetention.test.ts
```

Synthetic coverage: guest/staff/manual-booking access; admin property assignments; sandbox boundary; AAL2 denial; no client role elevation; unauthorized/missing uniform result; audit failure; reference-only attachments; upload category/type/size/quarantine; 601 nested files and pagination failure; holds and finite policy review; counts-only dry-run; separately authorized bounded disposal on in-memory fixtures; partial failures; zero external AI calls; attributed manual review; missing-signature no-send; upload→quarantine→synthetic release→manual review→short-link→dry-run end-to-end.

**Still unverified / blockers before G3/G4:** actual RLS/storage policy SQL, role grants, multi-property staff assignments, MFA freshness, provider signatures/retry integration, parser/malware service, real link expiry, actual upload denial and synthetic DB hold-race/pagination tests. No linter or security scan was used to represent these as fixed.

Recorded result: **70 candidate security tests + 13 existing regressions = 83 passing tests**, 27 November 2026. Preview build log was clean; no runtime code was changed. Production enforcement remains unmodified.

## Promotion and rollback gates

1. **G2 checkpoint:** inspect local modules and tests. Changes are inert and can be removed without affecting production.
2. **Before drafting executable migrations:** obtain an independent PostgreSQL/storage test environment. The preview/practice property is not isolation. Export schema/policy definitions only, no guest records or credentials. Add protected pending-scan/hold/disposition state and attachment references additively, respecting message immutability.
3. **G3:** separate authorization for policies/schema/bucket settings. Test full legitimate role/guest/manual-booking/object/table paths against synthetic rows. All unauthorized object and metadata paths must deny consistently. Audited signing cannot be bypassed by a remaining direct storage policy.
4. **G4:** separate authorization to wire/deploy frontend/functions and dry-run cron. Preserve manual check-in and TM30; confirm zero AI calls when disabled. Monitor denied legitimate reads, upload failures and dry-run completeness.
5. **G5/G6:** independent legal retention/disposition and historical-link approval. Counts-only first; evidence retained; first bounded batch reconciled before continuation. Never silently migrate all objects or delete historical messages.
6. **Rollback:** fail closed/admin-only or temporarily disable the affected action; never restore role-only cross-property access, long-lived links or external ID processing. Preserve evidence and metadata for partial-disposition reconciliation; no destructive schema rollback.
7. **G7:** Archives remains outside this package and disabled.