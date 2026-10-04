import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { BigCta, Panel, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

// Fallback rail for guest messaging: if the guest isn't reading the portal and
// WhatsApp isn't linked (or failed), the message still reaches them by email.
interface Props {
  language?: string
  guest_name?: string
  staff_name?: string
  unit_name?: string
  snippet?: string
  portal_url?: string
  whatsapp_number?: string
}

const Email = (d: Props) => {
  const lang = d.language
  const where = d.unit_name ? ` (${d.unit_name})` : ''
  return (
    <Shell
      preview={t(lang, 'The camp replied to your message.', 'ทางแคมป์ตอบข้อความของคุณแล้ว')}
      title={t(lang, 'New message from Lamai Camp', 'ข้อความใหม่จาก Lamai Camp')}
      intro={t(
        lang,
        `Hi ${d.guest_name || 'there'} — ${d.staff_name || 'the front desk'} just replied about your stay${where}.`,
        `สวัสดี ${d.guest_name || ''} — ${d.staff_name || 'แผนกต้อนรับ'} ตอบข้อความเกี่ยวกับการเข้าพักของคุณ${where}`,
      )}
    >
      <Panel heading={t(lang, 'What they said', 'ข้อความ')}>
        <Text style={{ ...bodyText, whiteSpace: 'pre-line', margin: 0 }}>
          {d.snippet || t(lang, 'Open the portal to read it.', 'เปิดพอร์ทัลเพื่ออ่านข้อความ')}
        </Text>
      </Panel>

      <BigCta
        href={d.portal_url || 'https://lmtcampstay.com/guest?action=messages'}
        label={t(lang, 'Read and reply', 'อ่านและตอบกลับ')}
        sub={t(lang, 'Your whole conversation lives in the guest portal.', 'บทสนทนาทั้งหมดอยู่ในพอร์ทัลของคุณ')}
      />

      {d.whatsapp_number ? (
        <Text style={bodyText}>
          {t(
            lang,
            `Prefer WhatsApp? Message the camp on ${d.whatsapp_number}.`,
            `สะดวก WhatsApp มากกว่า? ส่งข้อความถึงแคมป์ที่ ${d.whatsapp_number}`,
          )}
        </Text>
      ) : null}
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(
      d?.language,
      `New message from Lamai Camp${d?.unit_name ? ` (${d.unit_name})` : ''}`,
      `ข้อความใหม่จาก Lamai Camp${d?.unit_name ? ` (${d.unit_name})` : ''}`,
    ),
  displayName: 'Guest message notice',
  previewData: {
    guest_name: 'Camille',
    staff_name: 'Nikki',
    unit_name: 'Room 12',
    snippet: 'Your driver will be waiting at the arrivals exit with a Lamai sign.',
    portal_url: 'https://lmtcampstay.com/guest',
    whatsapp_number: '+66 00 000 0000',
  },
} satisfies TemplateEntry
