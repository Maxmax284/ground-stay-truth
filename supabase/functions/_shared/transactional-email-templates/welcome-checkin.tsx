import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import { Panel, Rows, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
  wifi_network?: string
  wifi_password?: string
  house_rules?: string
  checkin_time?: string
  checkout_time?: string
  check_in?: string
  check_out?: string
  emergency_name?: string
  emergency_phone?: string
}

const Email = (d: Props) => {
  const lang = d.language
  return (
    <Shell
      preview={t(lang, 'Everything you need for your stay.', 'ข้อมูลที่จำเป็นสำหรับการเข้าพัก')}
      title={t(lang, `Welcome, ${d.guest_name || 'guest'}!`, `ยินดีต้อนรับ ${d.guest_name || ''}!`)}
      intro={t(
        lang,
        `Today's the day — your stay at ${d.unit_name || 'the camp'} begins. Here's everything you need.`,
        `วันนี้เป็นวันเช็คอินของคุณที่ ${d.unit_name || ''} นี่คือข้อมูลที่จำเป็น`,
      )}
    >
      <Panel tone="good" heading={t(lang, 'WiFi', 'WiFi')}>
        <Rows
          rows={[
            [t(lang, 'Network', 'ชื่อเครือข่าย'), d.wifi_network || '—'],
            [t(lang, 'Password', 'รหัสผ่าน'), d.wifi_password || '—'],
          ]}
        />
      </Panel>

      <Panel heading={t(lang, 'House Rules', 'กฎบ้าน')}>
        <Text style={{ ...bodyText, whiteSpace: 'pre-line', margin: 0 }}>
          {d.house_rules ||
            t(lang, 'Please ask at front desk.', 'กรุณาสอบถามที่แผนกต้อนรับ')}
        </Text>
      </Panel>

      <Panel heading={t(lang, 'Check-in / Check-out', 'เช็คอิน / เช็คเอาท์')}>
        <Rows
          rows={[
            [t(lang, 'Check-in from', 'เช็คอินตั้งแต่'), d.checkin_time || '14:00'],
            [t(lang, 'Check-out by', 'เช็คเอาท์ภายใน'), d.checkout_time || '12:00'],
            [
              t(lang, 'Your dates', 'วันที่'),
              `${d.check_in ?? '—'} → ${d.check_out ?? '—'}`,
            ],
          ]}
        />
      </Panel>

      <Panel tone="alert" heading={t(lang, 'Emergency Contact', 'ติดต่อฉุกเฉิน')}>
        <Text style={{ ...bodyText, margin: 0 }}>
          <strong>{d.emergency_name || t(lang, 'Front Desk', 'แผนกต้อนรับ')}</strong>
          <br />
          {d.emergency_phone || t(lang, 'See Guest Portal', 'ดูใน Guest Portal')}
        </Text>
      </Panel>

      <Text style={bodyText}>
        {t(
          lang,
          'Need anything? Message us through the Guest Portal anytime.',
          'ต้องการอะไรเพิ่มเติม? ส่งข้อความผ่าน Guest Portal ได้ตลอดเวลา',
        )}
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => t(d?.language, 'Welcome to Your Stay!', 'ยินดีต้อนรับ!'),
  displayName: 'Welcome / check-in',
  previewData: {
    guest_name: 'Arvid',
    unit_name: 'Sea View Villa 2',
    wifi_network: 'LMT-Guest',
    wifi_password: 'muaythai2027',
    house_rules: 'No shoes indoors.\nQuiet hours after 22:00.',
    checkin_time: '14:00',
    checkout_time: '12:00',
    check_in: '2027-01-27',
    check_out: '2027-02-07',
    emergency_name: 'Front Desk',
    emergency_phone: '+66 00 000 0000',
  },
} satisfies TemplateEntry
