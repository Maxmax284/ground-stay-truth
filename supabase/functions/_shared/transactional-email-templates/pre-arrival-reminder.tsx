import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Panel, Rows, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
  check_in?: string
  checkin_time?: string
}

const Email = (d: Props) => {
  const lang = d.language
  return (
    <Shell
      preview={t(lang, 'Your stay starts soon.', 'ใกล้ถึงวันเข้าพักแล้ว')}
      title={t(lang, 'See You Soon!', 'เจอกันเร็วๆ นี้!')}
      intro={t(
        lang,
        `${d.guest_name || 'Hi'}, your stay at ${d.unit_name || 'the camp'} starts on ${d.check_in ?? '—'}.`,
        `${d.guest_name || ''} การเข้าพักของคุณที่ ${d.unit_name || ''} เริ่มวันที่ ${d.check_in ?? '—'}`,
      )}
    >
      <Panel tone="info">
        <Rows
          rows={[
            [
              t(lang, 'Check-in', 'เช็คอิน'),
              `${d.check_in ?? '—'} ${t(lang, 'from', 'ตั้งแต่')} ${d.checkin_time ?? '14:00'}`,
            ],
          ]}
        />
        <Text style={{ ...bodyText, margin: '10px 0 0 0', color: '#1e40af' }}>
          {t(
            lang,
            'Please complete your ID upload and pre-arrival checklist in the Guest Portal.',
            'กรุณาอัพโหลดบัตรประชาชนและกรอก checklist ใน Guest Portal',
          )}
        </Text>
      </Panel>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(
      d?.language,
      'Arriving Soon — Pre-Arrival Checklist',
      'ใกล้ถึงวันเข้าพัก — เตรียมตัวก่อนเดินทาง',
    ),
  displayName: 'Pre-arrival reminder',
  previewData: {
    guest_name: 'Arvid',
    unit_name: 'Sea View Villa 2',
    check_in: '2027-01-27',
    checkin_time: '14:00',
  },
} satisfies TemplateEntry
