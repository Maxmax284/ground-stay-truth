import * as React from 'npm:react@18.3.1'
import { Img, Section, Text } from 'npm:@react-email/components@0.0.22'
import { Cta, Panel, Rows, Shell, bodyText, t } from './shared.tsx'
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
}

const Email = (d: Props) => {
  const lang = d.language
  const qrTarget =
    d.qr_target ||
    `https://lmtcampstay.com/guest${
      d.confirmation_number ? `?ref=${encodeURIComponent(d.confirmation_number)}` : ''
    }`
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(
    qrTarget,
  )}`
  const vatMailto = `mailto:${d.contact_email || 'info@lmtcampstay.com'}?subject=${encodeURIComponent(
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

      {d.confirmation_pdf_url ? (
        <>
          <Cta
            href={d.confirmation_pdf_url}
            label={t(
              lang,
              'Download Booking Confirmation (PDF)',
              'ดาวน์โหลดใบยืนยันการจอง (PDF)',
            )}
          />
          <Text style={{ ...bodyText, fontSize: '12px', textAlign: 'center' }}>
            {t(
              lang,
              'Show it to immigration, airlines, or your employer.',
              'ใช้แสดงต่อตรวจคนเข้าเมือง สายการบิน หรือที่ทำงาน',
            )}
          </Text>
        </>
      ) : null}

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
          alt="Booking QR code"
          width="140"
          height="140"
          style={{ display: 'block', margin: '0 auto 8px auto', borderRadius: '6px' }}
        />
        <Text style={{ margin: 0, color: '#777777', fontSize: '12px' }}>
          {t(lang, 'Scan to open your booking', 'สแกนเพื่อเปิดการจองของคุณ')}
        </Text>
      </Section>

      <Text style={{ ...bodyText, textAlign: 'center', fontSize: '13px' }}>
        {t(lang, 'Need a Thai VAT invoice? ', 'ต้องการใบกำกับภาษี? ')}
        <a href={vatMailto} style={{ color: '#b81c1c', fontWeight: 700, textDecoration: 'none' }}>
          {t(lang, 'Request Thai VAT invoice', 'ขอใบกำกับภาษี (VAT)')}
        </a>
      </Text>

      <Text style={bodyText}>
        {t(
          lang,
          'Upload your ID document through the Guest Portal before check-in.',
          'กรุณาอัพโหลดเอกสารประจำตัวผ่าน Guest Portal ก่อนเช็คอิน',
        )}
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
  },
} satisfies TemplateEntry
