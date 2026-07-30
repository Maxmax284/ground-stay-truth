import * as React from 'npm:react@18.3.1'
import { Img, Section, Text } from 'npm:@react-email/components@0.0.22'
import { BigCta, Panel, Rows, Shell, bodyText, t } from './shared.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  language?: string
  guest_name?: string
  unit_name?: string
  check_in?: string
  check_out?: string
  checkin_time?: string
  checkout_time?: string
  num_guests?: number | string
  total_formatted?: string
  confirmation_number?: string | null
  confirmation_pdf_url?: string | null
  contact_email?: string
  qr_target?: string
  portal_url?: string
}

const Email = (d: Props) => {
  const lang = d.language
  const portalUrl =
    d.portal_url ||
    `https://lmtcampstay.com/guest${
      d.confirmation_number ? `?ref=${encodeURIComponent(d.confirmation_number)}` : ''
    }`
  const qrTarget = d.qr_target || portalUrl
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(
    qrTarget,
  )}`
  const contactEmail = d.contact_email || 'info@lmtcampstay.com'
  const vatMailto = `mailto:${contactEmail}?subject=${encodeURIComponent(
    `VAT invoice request — ${d.confirmation_number || 'booking'}`,
  )}`

  return (
    <Shell
      preview={t(lang, 'Your stay is confirmed.', 'การเข้าพักของคุณได้รับการยืนยันแล้ว')}
      title={t(lang, 'Booking Confirmed', 'ยืนยันการจองแล้ว')}
      intro={t(
        lang,
        `Sawadee ${d.guest_name || 'there'}! Your stay is confirmed.`,
        `สวัสดีครับ/ค่ะ ${d.guest_name || ''} การเข้าพักของคุณได้รับการยืนยันแล้ว`,
      )}
    >
      {d.confirmation_number ? (
        <Text style={{ ...bodyText, color: '#1a1a1a', fontSize: '13px' }}>
          <strong>{t(lang, 'Confirmation #', 'เลขที่ยืนยัน')}</strong> {d.confirmation_number}
        </Text>
      ) : null}

      <Panel heading={d.unit_name || t(lang, 'Your unit', 'ห้องพักของคุณ')}>
        <Rows
          rows={[
            [
              t(lang, 'Check-in', 'เช็คอิน'),
              `${d.check_in ?? '—'} ${t(lang, 'from', 'ตั้งแต่')} ${d.checkin_time ?? '14:00'}`,
            ],
            [
              t(lang, 'Check-out', 'เช็คเอาท์'),
              `${d.check_out ?? '—'} ${t(lang, 'by', 'ภายใน')} ${d.checkout_time ?? '12:00'}`,
            ],
            [t(lang, 'Guests', 'จำนวนผู้เข้าพัก'), String(d.num_guests ?? '—')],
            [t(lang, 'Total', 'ราคารวม'), d.total_formatted ?? '—'],
          ]}
        />
      </Panel>

      {/* Primary action — the PDF is a link, not an attachment, so it has to be
          impossible to miss. Table-based button stays visible with images off. */}
      {d.confirmation_pdf_url ? (
        <BigCta
          href={d.confirmation_pdf_url}
          label={t(
            lang,
            'Download Booking Confirmation PDF',
            'ดาวน์โหลดใบยืนยันการจอง (PDF)',
          )}
          sub={t(
            lang,
            'Use this document for check-in, travel records, or proof of accommodation if needed.',
            'ใช้เอกสารนี้สำหรับเช็คอิน บันทึกการเดินทาง หรือเป็นหลักฐานที่พัก',
          )}
        />
      ) : null}

      {/* What to do next */}
      <Panel heading={t(lang, 'What to do next', 'ขั้นตอนถัดไป')} tone="info">
        <Text style={{ ...bodyText, margin: 0 }}>
          {t(
            lang,
            'You can open your booking through the Guest Portal, upload your ID document before check-in, and review your stay details anytime.',
            'คุณสามารถเปิดการจองผ่าน Guest Portal อัปโหลดเอกสารประจำตัวก่อนเช็คอิน และดูรายละเอียดการเข้าพักได้ตลอดเวลา',
          )}
        </Text>
      </Panel>

      <BigCta
        href={portalUrl}
        label={t(lang, 'Open Guest Portal', 'เปิด Guest Portal')}
        color="#1a1a1a"
        sub={t(
          lang,
          'The Guest Portal is always the up-to-date record of your stay.',
          'Guest Portal คือข้อมูลการเข้าพักที่เป็นปัจจุบันเสมอ',
        )}
      />

      <Section
        style={{
          textAlign: 'center',
          margin: '22px 0',
          padding: '16px',
          backgroundColor: '#fafafa',
          borderRadius: '12px',
        }}
      >
        <Img
          src={qrImg}
          alt={t(lang, 'QR code linking to your booking', 'คิวอาร์โค้ดสำหรับการจองของคุณ')}
          width="140"
          height="140"
          style={{ display: 'block', margin: '0 auto 8px auto', borderRadius: '6px' }}
        />
        <Text style={{ margin: 0, color: '#777777', fontSize: '12px' }}>
          {t(lang, 'Scan to open your booking, or ', 'สแกนเพื่อเปิดการจอง หรือ ')}
          <a href={qrTarget} style={{ color: '#b81c1c', fontWeight: 700 }}>
            {t(lang, 'use this link', 'ใช้ลิงก์นี้')}
          </a>
          {t(lang, ' if the code does not display.', ' หากคิวอาร์โค้ดไม่แสดง')}
        </Text>
      </Section>

      <Text style={{ ...bodyText, textAlign: 'center', fontSize: '13px' }}>
        {t(lang, 'Need a Thai VAT invoice? ', 'ต้องการใบกำกับภาษี? ')}
        <a href={vatMailto} style={{ color: '#b81c1c', fontWeight: 700, textDecoration: 'none' }}>
          {t(lang, 'Request Thai VAT invoice', 'ขอใบกำกับภาษี (VAT)')}
        </a>
      </Text>

      <Text style={{ ...bodyText, textAlign: 'center', fontSize: '13px' }}>
        {t(lang, 'Questions? Email us at ', 'มีคำถาม? อีเมลหาเราที่ ')}
        <a href={`mailto:${contactEmail}`} style={{ color: '#b81c1c', fontWeight: 700 }}>
          {contactEmail}
        </a>
      </Text>
    </Shell>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    t(d?.language, 'Booking Confirmed — LMT CampStay', 'ยืนยันการจอง — LMT CampStay'),
  displayName: 'Booking confirmed',
  previewData: {
    guest_name: 'Arvid Kestens',
    unit_name: 'Sea View Villa 2',
    check_in: '2027-01-27',
    check_out: '2027-02-07',
    checkin_time: '14:00',
    checkout_time: '12:00',
    num_guests: 2,
    total_formatted: 'THB 42,000.00',
    confirmation_number: 'LMT-2027-0042',
    confirmation_pdf_url: 'https://lmtcampstay.com/example-confirmation.pdf',
  },
} satisfies TemplateEntry
