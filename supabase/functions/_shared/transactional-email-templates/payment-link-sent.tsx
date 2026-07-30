import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Cta, Panel, Rows, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
  payment_label?: string
  amount_formatted?: string
  check_in?: string
  check_out?: string
  payment_url?: string
  expires_at_human?: string
}

const Email = (d: Props) => {
  const lang = d.language
  const url = d.payment_url || 'https://lmtcampstay.com/guest'
  return (
    <Shell
      preview={t(lang, 'Your secure payment link is ready.', 'ลิงก์ชำระเงินของคุณพร้อมแล้ว')}
      title={t(lang, 'Time to lock it in', 'ชำระเงินเพื่อยืนยันการจอง')}
      intro={t(
        lang,
        `${d.guest_name || 'Hey'} — here's the secure link to pay your ${
          d.payment_label || 'deposit'
        } for ${d.unit_name || 'your stay'}.`,
        `${d.guest_name || 'สวัสดี'} — นี่คือลิงก์ชำระ ${
          d.payment_label || 'มัดจำ'
        } สำหรับ ${d.unit_name || 'การเข้าพักของคุณ'}`,
      )}
    >
      <Panel>
        <Rows
          rows={[
            [d.payment_label || t(lang, 'Amount', 'จำนวนเงิน'), d.amount_formatted ?? '—'],
            [t(lang, 'Dates', 'วันที่'), `${d.check_in ?? '—'} → ${d.check_out ?? '—'}`],
          ]}
        />
      </Panel>

      <Cta href={url} label={t(lang, 'Pay securely now', 'ชำระเงินอย่างปลอดภัย')} color="#1a1a1a" />

      <Text style={bodyText}>
        {t(
          lang,
          `Link expires ${d.expires_at_human || 'soon'}. Card is processed by Stripe — we never see your details.`,
          'ลิงก์มีอายุจำกัด ชำระผ่าน Stripe อย่างปลอดภัย',
        )}
      </Text>
      <Text style={{ ...bodyText, fontSize: '12px', wordBreak: 'break-all', color: '#999999' }}>
        {t(
          lang,
          "If the button doesn't work, paste this into your browser: ",
          'หากปุ่มใช้งานไม่ได้ คัดลอกลิงก์นี้: ',
        )}
        {url}
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(d?.language, 'Your payment link is ready', 'ลิงก์ชำระเงินของคุณพร้อมแล้ว'),
  displayName: 'Payment link',
  previewData: {
    guest_name: 'Arvid',
    unit_name: 'Sea View Villa 2',
    payment_label: 'deposit',
    amount_formatted: 'THB 10,000.00',
    check_in: '2027-01-27',
    check_out: '2027-02-07',
    payment_url: 'https://lmtcampstay.com/pay/example',
    expires_at_human: 'in 48 hours',
  },
} satisfies TemplateEntry
