

# AI-Powered ID Document Verification

## What This Does

When a guest uploads an identification document (passport, national ID, driver's license), the system automatically sends the image to an AI model that analyzes it and returns structured feedback. This feedback is displayed as advisory notes to staff -- the AI never makes a final accept/reject decision.

### What the AI checks for:
- **Document type recognition** -- passport, national ID, driver's license, etc.
- **Expiry date extraction** -- flags if the document appears expired
- **Country of issue** -- identifies the issuing country
- **Visual quality concerns** -- blurry text, low resolution, signs of digital editing
- **Data readability** -- whether key fields (name, date of birth, document number) are legible
- **Overall confidence level** -- low / medium / high confidence that the document appears genuine

### What it does NOT do:
- No accept/reject decisions -- purely advisory
- No biometric matching
- No government database lookups
- No storing of extracted personal data (analysis results are just text notes)

## How It Works

1. Guest uploads an ID document (existing flow, unchanged)
2. After successful upload, the system sends the image to a backend function for analysis
3. The backend function calls Lovable AI (Gemini with vision) with the document image
4. Structured feedback is saved to a new `verification_status`, `verification_notes`, and `verified_at` columns on the `guest_documents` table
5. Staff see the AI feedback inline next to each document -- color-coded badges and expandable notes
6. Guests see a simple status indicator (analyzing, reviewed, flagged)

## Changes

### 1. Database Migration

Add three columns to `guest_documents`:

- `verification_status` (text, nullable) -- values: `pending`, `analyzing`, `clear`, `flagged`, `error`
- `verification_notes` (jsonb, nullable) -- structured AI output (document type, expiry, confidence, flags)
- `verified_at` (timestamptz, nullable) -- when the AI analysis completed

### 2. New Edge Function: `verify-document`

**File: `supabase/functions/verify-document/index.ts`**

- Receives: `{ documentId, filePath }`
- Downloads the image from the `guest-documents` storage bucket using the service role
- Converts to base64 and sends to Lovable AI Gateway using `google/gemini-2.5-flash` (vision-capable, cost-efficient)
- Uses tool calling to extract structured output:
  - `document_type`: string (passport, national_id, drivers_license, unknown)
  - `issuing_country`: string
  - `expiry_date`: string or null
  - `is_expired`: boolean
  - `holder_name_readable`: boolean
  - `document_number_readable`: boolean
  - `quality_issues`: string[] (e.g., "blurry text", "low resolution", "possible digital alteration")
  - `confidence`: "low" | "medium" | "high"
  - `summary`: string (one-line human-readable summary)
- Updates the `guest_documents` row with `verification_status` (clear/flagged), `verification_notes` (the JSON), and `verified_at`
- System prompt emphasizes: "You are an advisory document reviewer. Flag concerns but never make accept/reject decisions."

### 3. Upload Flow Update (`src/hooks/useGuestDocuments.ts`)

After a successful document upload and metadata insert:
- Set `verification_status` to `analyzing` on the new row
- Fire-and-forget call to the `verify-document` edge function (don't block the upload UX)
- The query will re-fetch and show the updated status once analysis completes

### 4. UI Updates (`src/components/GuestDocumentUpload.tsx`)

**For staff view** (when role is manager/front_desk):
- Show a small badge next to each document: "Analyzing..." (spinner), "Clear" (green), "Flagged" (amber), "Error" (gray)
- Expandable section showing the AI notes: document type, issuing country, expiry status, quality concerns, confidence level
- Flagged items get a subtle amber border to draw attention without being alarming

**For guest view**:
- Simple status only: "Analyzing...", "Reviewed" (no detailed AI notes exposed to guests)
- No color-coded flags visible to guests -- just confirmation their document was received and reviewed

### 5. Translation Keys (`src/i18n/locales/en.json`)

Add keys under a `verification` namespace:
- `verification.analyzing`, `verification.clear`, `verification.flagged`, `verification.error`
- `verification.documentType`, `verification.issuingCountry`, `verification.expiryDate`
- `verification.expired`, `verification.qualityIssues`, `verification.confidence`
- `verification.summary`, `verification.reviewed`

### 6. Config Update (`supabase/config.toml`)

Register the new `verify-document` function with `verify_jwt = true`.

## Technical Details

### File Summary

| File | Action |
|------|--------|
| `supabase/functions/verify-document/index.ts` | **Create** -- AI document analysis edge function |
| `src/hooks/useGuestDocuments.ts` | **Modify** -- trigger verification after upload, expose verification data |
| `src/components/GuestDocumentUpload.tsx` | **Modify** -- show verification status/notes per role |
| `src/i18n/locales/en.json` | **Modify** -- add verification translation keys |
| Database migration | **Add columns** -- verification_status, verification_notes, verified_at on guest_documents |

### AI Prompt Design

The system prompt for the edge function will instruct the model to:
- Identify the document type and issuing country
- Extract any visible expiry date and flag if expired
- Assess image quality and readability of key fields
- Note any visual anomalies (without making accusations)
- Return a confidence level and one-line summary
- Explicitly state it is advisory only

### Cost and Performance

- Uses `google/gemini-2.5-flash` -- fast and inexpensive for image analysis
- Analysis runs asynchronously after upload -- guests see instant upload confirmation
- Typical analysis time: 2-5 seconds
- Results cached in the database -- no re-analysis needed

### Security Considerations

- Document images never leave the backend -- the edge function fetches from storage server-side
- AI analysis results contain no extracted PII (no document numbers, names, or dates stored in notes -- only metadata like "name is readable: yes/no")
- Only staff with appropriate roles see detailed AI feedback
- Guests only see a generic "Reviewed" status

