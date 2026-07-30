import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Cta, Panel, Rows, Shell, bodyText } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

// Internal operational alert for staff/admins. Not guest-facing.
interface Props {
  title?: string
  message?: string
  severity?: string
  context?: Record<string, unknown>
  action_url?: string
  action_label?: string
}

const Email = (d: Props) => {
  const ctx = d.context && typeof d.context === 'object' ? d.context : {}
  const rows: Array<[string, string]> = Object.keys(ctx)
    .slice(0, 8)
    .map((k) => {
      const v = (ctx as Record<string, unknown>)[k]
      const display =
        v === null || v === undefined
          ? '—'
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v)
      return [k, display]
    })

  return (
    <Shell
      preview={d.title || 'Admin alert'}
      title={d.title || 'Admin alert'}
      intro={d.message || 'An operational event needs your attention.'}
    >
      {d.severity ? (
        <Text style={{ ...bodyText, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Severity: <strong>{d.severity}</strong>
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <Panel heading="Context">
          <Rows rows={rows} />
        </Panel>
      ) : null}

      {d.action_url ? (
        <Cta href={d.action_url} label={d.action_label || 'Open in CampStay'} color="#1a1a1a" />
      ) : null}
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    d?.title ? `LMT CampStay — ${d.title}` : 'LMT CampStay — Admin alert',
  displayName: 'Admin alert',
  previewData: {
    title: 'Stripe signature verification failed',
    message: 'A webhook arrived with an invalid signature.',
    severity: 'high',
    context: { endpoint: 'payment-webhook', attempts: 3 },
    action_url: 'https://lmtcampstay.com/monitoring',
    action_label: 'Open Operations Monitor',
  },
} satisfies TemplateEntry
