// Transactional email template registry.
// -----------------------------------------------------------------------------
// Every outbound app email renders from one of these React Email components.
// Template keys are the legacy `template_key` values so existing callers
// (send-booking-confirmation, send-scheduled-emails, create-payment-link,
// emit-admin-alert, expire-stale-bookings) keep working unchanged.
// -----------------------------------------------------------------------------
import type * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  // deno-lint-ignore no-explicit-any
  component: React.ComponentType<any>
  // deno-lint-ignore no-explicit-any
  subject: string | ((data: any) => string)
  displayName?: string
  // deno-lint-ignore no-explicit-any
  previewData?: Record<string, any>
  to?: string
}

import { template as bookingConfirmed } from './booking-confirmed.tsx'
import { template as depositReminder } from './deposit-reminder.tsx'
import { template as paymentLinkSent } from './payment-link-sent.tsx'
import { template as preArrivalReminder } from './pre-arrival-reminder.tsx'
import { template as checkoutFollowup } from './checkout-followup.tsx'
import { template as reviewRequest } from './review-request.tsx'
import { template as welcomeCheckin } from './welcome-checkin.tsx'
import { template as adminAlertGeneric } from './admin-alert-generic.tsx'
import { template as guestMessageNotice } from './guest-message-notice.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  booking_confirmed: bookingConfirmed,
  deposit_reminder: depositReminder,
  payment_link_sent: paymentLinkSent,
  pre_arrival_reminder: preArrivalReminder,
  checkout_followup: checkoutFollowup,
  review_request: reviewRequest,
  welcome_checkin: welcomeCheckin,
  admin_alert_generic: adminAlertGeneric,
  guest_message_notice: guestMessageNotice,
}
