import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Cta, Panel, Rows, Shell, bodyText, BRAND } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

// -----------------------------------------------------------------------------
// Reusable ADMIN alert email. Internal staff only — never guest-facing.
// Every alert answers: who / what / when / where / why it matters / what next.
// Readable with images off; no developer jargon in the copy.
// -----------------------------------------------------------------------------
interface Props {
  subject_line?: string
  severity?: string
  recipient_name?: string
  category_label?: string
  what_happened?: string
  when_label?: string
  where_label?: string
  why_it_matters?: string
  next_action?: string
  context?: Record<string, unknown>
  action_url?: string
  action_label?: string
  // legacy fields kept so older callers keep rendering
  title?: string
  message?: string
}

const SEVERITY_COPY: Record<string, string> = {
  info: 'For your records',
  action: 'Action needed',
  warning: 'Warning',
  critical: 'Critical',
}

const Email = (d: Props) => {
  const headline = d.category_label || d.title || 'Admin alert'
  const what = d.what_happened || d.message || 'An operational event needs your attention.'
  const severity = (d.severity || 'info').toLowerCase()
  const ctx = d.context && typeof d.context === 'object' ? d.context : {}

  const rows: Array<[string, string]> = [
    ['When', d.when_label || '—'],
    ['Where in CampStay', d.where_label || '—'],
    ...Object.keys(ctx)
      .slice(0, 8)
      .map((k) => {
        const v = (ctx as Record<string, unknown>)[k]
        const display =
          v === null || v === undefined
            ? '—'
            : typeof v === 'object'
              ? JSON.stringify(v)
              : String(v)
        return [k, display] as [string, string]
      }),
  ]

  return (
    <Shell
      preview={`${SEVERITY_COPY[severity] ?? 'Update'} — ${headline}`}
      title={headline}
      intro={what}
    >
      <Text style={{ ...bodyText, textTransform: 'uppercase', letterSpacing: '1px', color: BRAND }}>
        {SEVERITY_COPY[severity] ?? 'Update'}
      </Text>

      <Panel heading="The detail">
        <Rows rows={rows} />
      </Panel>

      {d.why_it_matters ? (
        <>
          <Text style={{ ...bodyText, fontWeight: 700 }}>Why this matters</Text>
          <Text style={bodyText}>{d.why_it_matters}</Text>
        </>
      ) : null}

      <Text style={{ ...bodyText, fontWeight: 700 }}>What to do next</Text>
      <Text style={bodyText}>{d.next_action || 'No action needed right now.'}</Text>

      {d.action_url ? (
        <Cta href={d.action_url} label={d.action_label || 'Open in CampStay'} color="#1a1a1a" />
      ) : null}

      <Text style={{ ...bodyText, fontSize: '12px', color: '#777' }}>
        This is an internal LMT CampStay staff alert. Guests do not receive it. You can change which
        alerts reach you in Settings → Notifications.
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    d?.subject_line || (d?.category_label ? `[CampStay] ${d.category_label}` : 'LMT CampStay — Admin alert'),
  displayName: 'Admin alert',
  previewData: {
    subject_line: '[Action Needed] New booking request',
    severity: 'action',
    category_label: 'New booking request',
    what_happened:
      'New booking request received for Superior Single 3. Guest: John Smith. Dates: Aug 12–18. Deposit pending.',
    when_label: '12 Aug 2026, 14:05 (Bangkok time)',
    where_label: 'Bookings',
    why_it_matters: 'A guest submits a new booking or inquiry.',
    next_action: 'Review the booking and confirm the payment step.',
    context: { 'Guest Name': 'John Smith', 'Unit Name': 'Superior Single 3' },
    action_url: 'https://lmtcampstay.com/bookings',
    action_label: 'Open in CampStay',
  },
} satisfies TemplateEntry
