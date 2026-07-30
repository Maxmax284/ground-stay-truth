import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
}

const Email = (d: Props) => {
  const lang = d.language
  return (
    <Shell
      preview={t(lang, 'How was your stay?', 'การเข้าพักเป็นอย่างไรบ้าง?')}
      title={t(lang, 'Your Feedback Matters', 'ความคิดเห็นของคุณมีค่า')}
      intro={t(
        lang,
        `${d.guest_name || 'Hi'}, how was your stay at ${d.unit_name || 'the camp'}?`,
        `${d.guest_name || ''} การเข้าพักที่ ${d.unit_name || ''} เป็นอย่างไรบ้าง?`,
      )}
    >
      <Text style={bodyText}>
        {t(
          lang,
          'Take a moment to share your experience — it helps future guests and helps us improve.',
          'แบ่งปันประสบการณ์ของคุณ — ช่วยแขกในอนาคตและช่วยให้เราปรับปรุงบริการ',
        )}
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => t(d?.language, 'How Was Your Stay?', 'การเข้าพักเป็นอย่างไรบ้าง?'),
  displayName: 'Review request',
  previewData: { guest_name: 'Arvid', unit_name: 'Sea View Villa 2' },
} satisfies TemplateEntry
