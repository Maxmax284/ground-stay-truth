// Shared app-email send path.
// -----------------------------------------------------------------------------
// Every feature that emails a guest or an admin calls sendAppEmail from its own
// edge function. Delivery, retries, rate limits and suppression are enforced by
// Lovable's managed email API; this wrapper keeps the two pieces of CampStay
// behaviour that live in the app:
//   1. SANDBOX ISOLATION — a fake stay must never reach a real inbox.
//   2. email_send_log observability rows (read by the booking email panel and
//      the Monitoring Center).
// -----------------------------------------------------------------------------
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts'

export interface SendAppEmailArgs {
  templateName: string
  recipientEmail?: string | null
  templateData?: Record<string, unknown>
  language?: string | null
  bookingId?: string | null
  idempotencyKey?: string | null
  source?: string | null
  triggeredBy?: string | null
}

export type SendAppEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; skipped: true; reason: 'sandbox' }
  | { sent: false; reason: 'recipient_suppressed' }
  | { sent: false; reason: 'send_failed'; error: string }

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

export async function sendAppEmail(args: SendAppEmailArgs): Promise<SendAppEmailResult> {
  const supabase = serviceClient()
  const messageId = crypto.randomUUID()
  const templateData: Record<string, unknown> = { ...(args.templateData ?? {}) }
  if (args.language && !templateData.language) {
    templateData.language = args.language
  }
  const idempotencyKey =
    args.idempotencyKey ||
    (args.bookingId ? `${args.templateName}-${args.bookingId}` : messageId)

  const logMeta = {
    booking_id: args.bookingId ?? null,
    language: (templateData.language as string | undefined) ?? null,
    idempotency_key: idempotencyKey,
    source: args.source ?? null,
    triggered_by: args.triggeredBy ?? null,
    has_pdf_link: Boolean(templateData.confirmation_pdf_url),
    sent_at: new Date().toISOString(),
  }

  const recipient = args.recipientEmail ?? ''

  // 1. Sandbox isolation — log and drop.
  if (args.bookingId) {
    const { data: isSandbox } = await supabase.rpc('is_sandbox_booking', {
      _booking_id: args.bookingId,
    })
    if (isSandbox === true) {
      console.log('sandbox: email suppressed', {
        templateName: args.templateName,
        bookingId: args.bookingId,
      })
      const { error } = await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: args.templateName,
        recipient_email: recipient,
        status: 'suppressed',
        metadata: { ...logMeta, sandbox: true, reason: 'sandbox_property' },
      })
      if (error) console.error('email_send_log write failed', error)
      return { sent: false, skipped: true, reason: 'sandbox' }
    }
  }

  // 2. Send through Lovable's managed email API.
  try {
    const result = await sendTemplateEmail(args.templateName, recipient, {
      templateData,
      idempotencyKey,
    })

    if (!result.sent) {
      const { error } = await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: args.templateName,
        recipient_email: recipient,
        status: 'suppressed',
        metadata: logMeta,
      })
      if (error) console.error('email_send_log write failed', error)
      return { sent: false, reason: 'recipient_suppressed' }
    }

    const { error } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: args.templateName,
      recipient_email: recipient,
      status: 'sent',
      metadata: logMeta,
    })
    if (error) console.error('email_send_log write failed', error)

    return { sent: true, messageId }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('App email send failed', {
      templateName: args.templateName,
      error: errorMsg,
    })
    const { error } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: args.templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: errorMsg.slice(0, 1000),
      metadata: logMeta,
    })
    if (error) console.error('email_send_log write failed', error)
    return { sent: false, reason: 'send_failed', error: errorMsg }
  }
}
