import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Panel, Rows, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
  deposit_amount?: string
  check_in?: string
  check_out?: string
}

const Email = (d: Props) => {
  const lang = d.language
  return (
    <Shell
      preview={t(lang, 'Your booking is awaiting deposit.', 'การจองของคุณรอการชำระมัดจำ')}
      title={t(lang, 'Deposit Reminder', 'แจ้งเตือนมัดจำ')}
      intro={t(
        lang,
        `${d.guest_name || 'Hi'}, your booking for ${d.unit_name || 'your stay'} is awaiting deposit.`,
        `${d.guest_name || ''} การจอง ${d.unit_name || ''} ของคุณรอการชำระมัดจำ`,
      )}
    >
      <Panel tone="warn">
        <Rows
          rows={[
            [t(lang, 'Amount due', 'จำนวนเงิน'), d.deposit_amount ?? '—'],
            [
              t(lang, 'Dates', 'วันที่'),
              `${d.check_in ?? '—'} — ${d.check_out ?? '—'}`,
            ],
          ]}
        />
      </Panel>
      <Text style={bodyText}>
        {t(
          lang,
          'Log in to your Guest Portal to complete payment.',
          'เข้าสู่ระบบ Guest Portal เพื่อชำระเงิน',
        )}
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(
      d?.language,
      'Deposit Reminder — Complete Your Booking',
      'แจ้งเตือนมัดจำ — ชำระเงินเพื่อยืนยันการจอง',
    ),
  displayName: 'Deposit reminder',
  previewData: {
    guest_name: 'Arvid',
    unit_name: 'Sea View Villa 2',
    deposit_amount: 'THB 10,000.00',
    check_in: '2027-01-27',
    check_out: '2027-02-07',
  },
} satisfies TemplateEntry
