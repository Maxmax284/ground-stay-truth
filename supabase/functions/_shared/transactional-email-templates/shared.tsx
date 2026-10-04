// Shared layout + primitives for LMT CampStay transactional emails.
// Brand: red #b81c1c on white, black type, plain and operational.
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

export const BRAND = '#b81c1c'
export const FOOTER_NOTE = 'LMT CampStay — Lamai Muay Thai Fight Camp'

export type Lang = 'en' | 'th'

export function pickLang(language?: string): Lang {
  return language === 'th' ? 'th' : 'en'
}

export function t<T>(language: string | undefined, en: T, th: T): T {
  return pickLang(language) === 'th' ? th : en
}

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: '#1a1a1a',
}

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 20px 32px 20px',
}

const masthead: React.CSSProperties = {
  borderBottom: `3px solid ${BRAND}`,
  paddingBottom: '10px',
  marginBottom: '22px',
}

const wordmark: React.CSSProperties = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: BRAND,
}

const h1: React.CSSProperties = {
  fontSize: '24px',
  lineHeight: '1.25',
  margin: '0 0 8px 0',
  color: '#1a1a1a',
}

const lead: React.CSSProperties = {
  color: '#555555',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 22px 0',
}

const footer: React.CSSProperties = {
  color: '#999999',
  fontSize: '12px',
  margin: '24px 0 0 0',
}

export const bodyText: React.CSSProperties = {
  color: '#555555',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 12px 0',
}

export function Shell({
  preview,
  title,
  intro,
  children,
}: {
  preview: string
  title: string
  intro?: string
  children?: React.ReactNode
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={masthead}>
            <Text style={wordmark}>LMT CampStay</Text>
          </Section>
          <Heading style={h1}>{title}</Heading>
          {intro ? <Text style={lead}>{intro}</Text> : null}
          {children}
          <Hr style={{ borderColor: '#eeeeee', margin: '28px 0 0 0' }} />
          <Text style={footer}>
            Replies to this email aren't read — please message the camp from your guest portal (lmtcampstay.com/guest).
            {' '}ตอบกลับอีเมลนี้จะไม่ถึงเรา — กรุณาส่งข้อความผ่านพอร์ทัลของคุณ
          </Text>
          <Text style={footer}>{FOOTER_NOTE}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export function Panel({
  heading,
  tone = 'neutral',
  children,
}: {
  heading?: string
  tone?: 'neutral' | 'warn' | 'info' | 'good' | 'alert'
  children: React.ReactNode
}) {
  const bg = {
    neutral: '#f8f8f8',
    warn: '#fff8e6',
    info: '#f0f7ff',
    good: '#f2fbf4',
    alert: '#fdf1f1',
  }[tone]
  const headColor = {
    neutral: '#1a1a1a',
    warn: '#8a6100',
    info: '#1e40af',
    good: '#166534',
    alert: '#991b1b',
  }[tone]
  return (
    <Section
      style={{
        backgroundColor: bg,
        borderRadius: '12px',
        padding: '18px 20px',
        margin: '0 0 18px 0',
      }}
    >
      {heading ? (
        <Text
          style={{
            margin: '0 0 12px 0',
            fontSize: '15px',
            fontWeight: 700,
            color: headColor,
          }}
        >
          {heading}
        </Text>
      ) : null}
      {children}
    </Section>
  )
}

export function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <>
      {rows.map(([label, value]) => (
        <table
          key={label}
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: '5px 0',
                  color: '#777777',
                  fontSize: '14px',
                  width: '42%',
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: '5px 0',
                  fontWeight: 600,
                  fontSize: '14px',
                  color: '#1a1a1a',
                }}
              >
                {value}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  )
}

export function Cta({
  href,
  label,
  color = BRAND,
}: {
  href: string
  label: string
  color?: string
}) {
  return (
    <Section style={{ textAlign: 'center', margin: '26px 0' }}>
      <a
        href={href}
        style={{
          backgroundColor: color,
          color: '#ffffff',
          textDecoration: 'none',
          padding: '13px 26px',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '15px',
          display: 'inline-block',
        }}
      >
        {label}
      </a>
    </Section>
  )
}

/**
 * Full-width, table-based CTA. Renders reliably in Gmail (desktop + mobile),
 * iOS Mail, Outlook and webmail — no background images, no external CSS, so it
 * stays visible even when the client blocks images.
 */
export function BigCta({
  href,
  label,
  sub,
  color = BRAND,
}: {
  href: string
  label: string
  sub?: string
  color?: string
}) {
  return (
    <Section style={{ margin: '24px 0' }}>
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        role="presentation"
        style={{ borderCollapse: 'separate' }}
      >
        <tbody>
          <tr>
            <td
              align="center"
              bgcolor={color}
              style={{
                backgroundColor: color,
                borderRadius: '10px',
                padding: '0',
              }}
            >
              <a
                href={href}
                style={{
                  display: 'block',
                  padding: '18px 20px',
                  color: '#ffffff',
                  fontSize: '17px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  lineHeight: '1.3',
                  textAlign: 'center',
                }}
              >
                {label}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      {sub ? (
        <Text
          style={{
            margin: '10px 0 0 0',
            color: '#777777',
            fontSize: '13px',
            lineHeight: '1.5',
            textAlign: 'center',
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Section>
  )
}
