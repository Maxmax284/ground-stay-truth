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
      preview={t(lang, 'Thank you for staying with us.', 'ขอบคุณสำหรับการเข้าพัก')}
      title={t(lang, 'Thank You!', 'ขอบคุณครับ/ค่ะ!')}
      intro={t(
        lang,
        `${d.guest_name || 'Hi'}, we hope you enjoyed your stay at ${d.unit_name || 'the camp'}.`,
        `${d.guest_name || ''} หวังว่าจะสนุกกับการเข้าพักที่ ${d.unit_name || ''}`,
      )}
    >
      <Text style={bodyText}>
        {t(
          lang,
          "We'd love to hear about your experience. Leave a review in your Guest Portal.",
          'รบกวนรีวิวประสบการณ์ของคุณใน Guest Portal',
        )}
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(d?.language, 'Thank You For Your Stay!', 'ขอบคุณสำหรับการเข้าพัก!'),
  displayName: 'Checkout follow-up',
  previewData: { guest_name: 'Arvid', unit_name: 'Sea View Villa 2' },
} satisfies TemplateEntry
