// Shared rich-format builders for Telegram + WhatsApp.
// Presentation-only: business logic, copy, and personality come from callers.
// Every builder returns a structure that includes a plain-text fallback so the
// outbound senders can always degrade gracefully if the rich format fails.

export type RichLang = "en" | "th" | "de" | "fr" | "ru" | "zh" | "ja" | "ko" | "es";

// ── Localized human-voice button labels (mirror lineFlex.ts dictionary) ──
const L = {
  letsGo:    { en: "Let's go",       th: "ไปกันเลย",     de: "Los geht's",    fr: "C'est parti",  ru: "Поехали",    zh: "走吧",     ja: "行こう",     ko: "가자",        es: "Vamos" },
  gotIt:     { en: "Got it",         th: "รับทราบ",       de: "Verstanden",    fr: "Compris",      ru: "Понял",      zh: "知道了",   ja: "了解",       ko: "알겠어요",    es: "Entendido" },
  tellMore:  { en: "Tell me more",   th: "บอกเพิ่ม",      de: "Mehr erzählen", fr: "En savoir plus", ru: "Подробнее", zh: "告诉我更多", ja: "もっと教えて", ko: "더 알려줘",   es: "Cuéntame más" },
  openApp:   { en: "Open app",       th: "เปิดแอป",       de: "App öffnen",    fr: "Ouvrir l'app", ru: "Открыть",    zh: "打开应用", ja: "アプリを開く", ko: "앱 열기",     es: "Abrir app" },
  viewBooking: { en: "View booking", th: "ดูการจอง",      de: "Buchung",       fr: "Réservation",  ru: "Бронь",      zh: "查看预订", ja: "予約を見る", ko: "예약 보기",   es: "Ver reserva" },
  respond:   { en: "Respond now",    th: "ตอบเลย",        de: "Jetzt reagieren", fr: "Répondre",   ru: "Ответить",   zh: "立即回应", ja: "今すぐ対応", ko: "지금 응답",   es: "Responder" },
  yes:       { en: "Yes",            th: "ใช่",           de: "Ja",            fr: "Oui",          ru: "Да",         zh: "是",       ja: "はい",       ko: "네",          es: "Sí" },
  no:        { en: "No",             th: "ไม่",           de: "Nein",          fr: "Non",          ru: "Нет",        zh: "否",       ja: "いいえ",     ko: "아니요",      es: "No" },
  later:     { en: "Later",          th: "ไว้ก่อน",       de: "Später",        fr: "Plus tard",    ru: "Позже",      zh: "稍后",     ja: "後で",       ko: "나중에",      es: "Después" },
  menu:      { en: "Menu",           th: "เมนู",          de: "Menü",          fr: "Menu",         ru: "Меню",       zh: "菜单",     ja: "メニュー",   ko: "메뉴",        es: "Menú" },
  pickOne:   { en: "Pick one",       th: "เลือก",         de: "Auswählen",     fr: "Choisir",      ru: "Выбрать",    zh: "选择",     ja: "選ぶ",       ko: "선택",        es: "Elegir" },
};

export function pick(dict: any, lang: RichLang): string {
  return dict[lang] ?? dict.en;
}
export const Labels = L;

// ── MarkdownV2 escaping (Telegram requires escaping these chars in plain text) ──
// https://core.telegram.org/bots/api#markdownv2-style
const MDV2_RESERVED = /[_*\[\]()~`>#+\-=|{}.!\\\\]/g;
export function escMdV2(s: string): string {
  return String(s ?? "").replace(MDV2_RESERVED, "\\$&");
}

// ── Common button + role types ──
export type Role = "guest" | "front_desk" | "front_desk_supervisor" | "manager" | "admin" | "super_admin" | "maintenance" | string;

export interface RichButton {
  label: string;        // human-voice — caller decides
  data?: string;        // postback / callback identifier
  uri?: string;         // tap-to-open URL
}

export interface RichListItem {
  title: string;
  description?: string;
  data?: string;
}

export interface RichListSection {
  title?: string;
  items: RichListItem[];
}

// ── Telegram: inline keyboard from RichButton[] ──
// Lays out up to 3 buttons per row for readability. URI buttons render as
// "url" actions; data buttons as callback_data.
export function buildTelegramInlineKeyboard(buttons: RichButton[]): any | undefined {
  if (!buttons?.length) return undefined;
  const rows: any[][] = [];
  let row: any[] = [];
  for (const b of buttons) {
    const btn = b.uri
      ? { text: b.label, url: b.uri }
      : { text: b.label, callback_data: (b.data ?? b.label).slice(0, 64) };
    row.push(btn);
    if (row.length >= 3) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return { inline_keyboard: rows };
}

// ── Telegram: persistent /commands menu (role-aware) ──
// Caller sends this once per user/scope via setMyCommands. Returned shape is
// the array of {command, description} objects per Telegram spec.
export interface BotCommand { command: string; description: string }

export function telegramCommandsForRole(role: Role, lang: RichLang = "en"): BotCommand[] {
  const isStaff = role !== "guest";
  const isAdmin = role === "admin" || role === "super_admin";

  // Localized descriptions — keep terse, in Kru Glitch voice.
  const D = {
    help:     { en: "What can I do for you", th: "ช่วยอะไรได้บ้าง" },
    booking:  { en: "Your current booking",  th: "การจองของคุณ" },
    arrival:  { en: "Arrival info & ETA",    th: "ข้อมูลการมาถึง" },
    rooms:    { en: "Browse rooms",          th: "ดูห้องพัก" },
    ferry:    { en: "Ferry times",           th: "ตารางเรือ" },
    food:     { en: "Food nearby",           th: "อาหารใกล้ที่พัก" },
    pause:    { en: "Pause Kru Glitch",      th: "หยุดบอทชั่วคราว" },
    resume:   { en: "Resume Kru Glitch",     th: "เปิดบอทอีกครั้ง" },
    link:     { en: "Link account /link 123456", th: "เชื่อมบัญชี /link 123456" },
    unlink:   { en: "Disconnect this chat",  th: "ตัดการเชื่อมต่อ" },
    today:    { en: "Today's arrivals & departures", th: "เข้า-ออกวันนี้" },
    guests:   { en: "Current in-house guests", th: "แขกที่พักอยู่" },
    briefing: { en: "Daily briefing",        th: "สรุปประจำวัน" },
    queue:    { en: "Pending approvals",     th: "รออนุมัติ" },
    note:     { en: "Add internal note: /note ...", th: "บันทึกภายใน: /note ..." },
    intel:    { en: "Local intel & weather", th: "ข้อมูลพื้นที่และอากาศ" },
  };
  const t = (k: keyof typeof D) => (D[k] as any)[lang] ?? D[k].en;

  if (!isStaff) {
    return [
      { command: "help",    description: t("help") },
      { command: "booking", description: t("booking") },
      { command: "arrival", description: t("arrival") },
      { command: "rooms",   description: t("rooms") },
      { command: "ferry",   description: t("ferry") },
      { command: "food",    description: t("food") },
      { command: "intel",   description: t("intel") },
      { command: "link",    description: t("link") },
      { command: "pause",   description: t("pause") },
      { command: "resume",  description: t("resume") },
      { command: "unlink",  description: t("unlink") },
    ];
  }

  const staffBase: BotCommand[] = [
    { command: "help",     description: t("help") },
    { command: "today",    description: t("today") },
    { command: "guests",   description: t("guests") },
    { command: "briefing", description: t("briefing") },
    { command: "rooms",    description: t("rooms") },
    { command: "intel",    description: t("intel") },
    { command: "note",     description: t("note") },
    { command: "pause",    description: t("pause") },
    { command: "resume",   description: t("resume") },
  ];
  if (isAdmin) {
    staffBase.splice(4, 0, { command: "queue", description: t("queue") });
  }
  return staffBase;
}

// ── WhatsApp Interactive: Reply Buttons (max 3) ──
// Twilio Content Templates can carry these; for the messaging-router we use
// the Twilio Content API with a pre-approved template OR fall back to plain
// text. To keep the pipeline portable we emit the *intent* here and let the
// Twilio sender translate it into either Content SID + variables or plain text.
export interface WhatsAppReplyButtonsIntent {
  kind: "reply_buttons";
  body: string;                 // main body text — already in Kru Glitch voice
  buttons: RichButton[];        // 1–3 buttons; caller enforces voice
  footer?: string;              // optional small footer text
  headerText?: string;
}

// ── WhatsApp Interactive: List Message ──
// Used for menu-style queries with > 3 options. Each item has a title and an
// optional description; LINE-style sectioning supported.
export interface WhatsAppListIntent {
  kind: "list";
  body: string;
  buttonLabel: string;          // e.g. "Pick one"
  sections: RichListSection[];  // up to 10 items total across sections
  footer?: string;
  headerText?: string;
}

// ── WhatsApp Media (image + caption) ──
export interface WhatsAppMediaIntent {
  kind: "media";
  mediaUrl: string;
  caption: string;              // text fallback IS this caption
}

export type WhatsAppIntent = WhatsAppReplyButtonsIntent | WhatsAppListIntent | WhatsAppMediaIntent;

// Convert a WhatsApp intent to a plain-text fallback string for senders that
// can't render the interactive shape (SMS, missing template, etc.).
export function whatsAppIntentToText(i: WhatsAppIntent): string {
  if (i.kind === "media") return i.caption;
  if (i.kind === "reply_buttons") {
    const opts = i.buttons.map((b, idx) => `${idx + 1}. ${b.label}`).join("\n");
    return `${i.headerText ? i.headerText + "\n\n" : ""}${i.body}\n\n${opts}${i.footer ? `\n\n${i.footer}` : ""}`;
  }
  // list
  const lines: string[] = [];
  if (i.headerText) lines.push(i.headerText, "");
  lines.push(i.body, "");
  let n = 1;
  for (const s of i.sections) {
    if (s.title) lines.push(`— ${s.title} —`);
    for (const item of s.items) {
      lines.push(`${n}. ${item.title}${item.description ? ` — ${item.description}` : ""}`);
      n++;
    }
  }
  if (i.footer) lines.push("", i.footer);
  return lines.join("\n");
}

// ── Telegram rich payload ──
export interface TelegramRichPayload {
  text: string;                 // MarkdownV2-formatted (caller is responsible)
  parse_mode: "MarkdownV2";
  reply_markup?: any;           // inline_keyboard
  // Optional plain-text fallback if MarkdownV2 send fails.
  plainText: string;
}

// ── Helpers used by event mappers ──

// Rotate header copy to avoid static repetition (mirrors lineFlex helper).
export function rotateGreeting(pool: string[], seed?: string | number): string {
  if (!pool.length) return "";
  const s = typeof seed === "number" ? seed : (seed ?? "").toString().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = (Math.abs(s) + Date.now()) % pool.length;
  return pool[idx % pool.length];
}

// Build a structured MarkdownV2 block: bold title, optional muted subtitle,
// optional metric rows (label/value), optional body line.
export function mdV2Block(opts: {
  title: string;
  subtitle?: string;
  body?: string;
  rows?: { label: string; value: string | number }[];
  urgent?: boolean;
}): { md: string; plain: string } {
  const t = escMdV2(opts.title);
  const titleLine = opts.urgent ? `*${t}*` : `*${t}*`;
  const lines: string[] = [titleLine];
  const plain: string[] = [opts.title];
  if (opts.subtitle) {
    lines.push(`_${escMdV2(opts.subtitle)}_`);
    plain.push(opts.subtitle);
  }
  if (opts.rows?.length) {
    lines.push("");
    plain.push("");
    for (const r of opts.rows) {
      lines.push(`*${escMdV2(r.label)}:* ${escMdV2(String(r.value))}`);
      plain.push(`${r.label}: ${r.value}`);
    }
  }
  if (opts.body) {
    lines.push("");
    plain.push("");
    lines.push(escMdV2(opts.body));
    plain.push(opts.body);
  }
  return { md: lines.join("\n"), plain: plain.join("\n") };
}

// ── Event → rich payload mappers ──
// Mirrors the LINE buildFlexForEvent map so all three channels stay aligned.
// Returns null when the event has no rich-format upgrade — caller falls back
// to the existing buildMessage() plain-text output.

export function buildTelegramForEvent(
  eventType: string,
  metadata: Record<string, any>,
  lang: RichLang = "en",
  role: Role = "guest",
): TelegramRichPayload | null {
  const m = metadata ?? {};

  // Helper to assemble payload with optional inline keyboard.
  const make = (block: { md: string; plain: string }, buttons?: RichButton[]): TelegramRichPayload => ({
    text: block.md,
    parse_mode: "MarkdownV2",
    reply_markup: buttons?.length ? buildTelegramInlineKeyboard(buttons) : undefined,
    plainText: block.plain,
  });

  switch (eventType) {
    case "arrival_stage_1_guest": {
      const greet = rotateGreeting(
        lang === "th" ? ["พรุ่งนี้ถึงแล้ว", "อีกวันเดียว"] : ["Tomorrow's the day", "One sleep to go"],
        m.unit_name,
      );
      const block = mdV2Block({
        title: greet,
        subtitle: `${m.property_name ?? "Property"} · ${m.check_in_time ?? "16:00"}`,
        body: lang === "th"
          ? "นำบัตรประชาชน + เลขจอง ส่งข้อความหาผมได้ตลอด"
          : "Bring ID + booking ref. Message me anytime — Kru Glitch.",
      });
      return make(block, [
        { label: pick(L.openApp, lang), data: `booking:${m.booking_id ?? ""}` },
        { label: pick(L.tellMore, lang), data: `arrival:tellmore:${m.booking_id ?? ""}` },
      ]);
    }

    case "arrival_stage_4_guest":
    case "room_ready_guest":
    case "room_ready": {
      const isReady = eventType === "room_ready" || eventType === "room_ready_guest";
      const titles = isReady
        ? (lang === "th" ? ["ห้องพร้อมแล้ว", "เข้าได้เลย"] : ["Your room's ready", "Room's good to go"])
        : (lang === "th" ? ["เช็คอินเรียบร้อย 🥊", "ถึงแล้ว เริ่มเลย"] : ["You're checked in 🥊", "You're in"]);
      const block = mdV2Block({
        title: rotateGreeting(titles, m.unit_name),
        subtitle: m.unit_name,
        body: m.wifi ? `WiFi: ${m.wifi}` : (m.address ? String(m.address).slice(0, 140) : undefined),
      });
      return make(block, [
        { label: pick(L.gotIt, lang), data: `ack:${eventType}:${m.booking_id ?? ""}` },
        { label: pick(L.tellMore, lang), data: `arrival:tellmore:${m.booking_id ?? ""}` },
      ]);
    }

    case "booking_approval_needed": {
      const block = mdV2Block({
        title: lang === "th" ? "รออนุมัติ" : "Approval needed",
        subtitle: `${m.guest_name ?? "Guest"} · ${m.unit_name ?? "Unit"}`,
        rows: [
          { label: lang === "th" ? "เช็คอิน" : "Check-in", value: m.check_in ?? "?" },
        ],
      });
      return make(block, [
        { label: lang === "th" ? "อนุมัติ" : "Approve", data: `booking:approve:${m.booking_id ?? ""}` },
        { label: lang === "th" ? "ปฏิเสธ" : "Decline", data: `booking:decline:${m.booking_id ?? ""}` },
        { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
      ]);
    }

    case "booking_confirmed": {
      const block = mdV2Block({
        title: lang === "th" ? "ยืนยันการจองแล้ว" : "Booking confirmed",
        subtitle: m.unit_name,
        rows: [
          { label: lang === "th" ? "เช็คอิน" : "Check-in", value: m.check_in ?? "?" },
          { label: lang === "th" ? "เช็คเอาท์" : "Check-out", value: m.check_out ?? "?" },
        ],
      });
      return make(block, [
        { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
        { label: pick(L.tellMore, lang), data: `booking:tellmore:${m.booking_id ?? ""}` },
      ]);
    }

    case "checkin_due": {
      const block = mdV2Block({
        title: lang === "th" ? "เช็คอินวันนี้" : "Check-in due today",
        subtitle: `${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"}`,
      });
      return make(block, [
        { label: lang === "th" ? "เช็คอินเลย" : "Check them in", data: `booking:checkin:${m.booking_id ?? ""}` },
        { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
      ]);
    }

    case "daily_briefing": {
      const greet = rotateGreeting(
        lang === "th" ? ["สรุปวันนี้", "เริ่มวันกัน"] : ["Morning briefing", "Today at a glance", "Here's the day"],
      );
      const rows: { label: string; value: string | number }[] = [];
      if (m.occupancy != null)            rows.push({ label: lang === "th" ? "เข้าพัก" : "Occupancy", value: m.occupancy });
      if (m.arrivals_today != null)       rows.push({ label: lang === "th" ? "มาวันนี้" : "Arrivals today", value: m.arrivals_today });
      if (m.departures_today != null)     rows.push({ label: lang === "th" ? "ออกวันนี้" : "Departures today", value: m.departures_today });
      if (m.pending_maintenance != null)  rows.push({ label: lang === "th" ? "ซ่อมค้าง" : "Pending maintenance", value: m.pending_maintenance });
      if (m.payment_flags != null)        rows.push({ label: lang === "th" ? "การชำระเงิน" : "Payment flags", value: m.payment_flags });
      if (!rows.length) return null;
      const block = mdV2Block({ title: greet, subtitle: String(m.date ?? new Date().toISOString().slice(0, 10)), rows });
      return make(block, [{ label: pick(L.openApp, lang), data: "briefing:open" }]);
    }

    case "urgent_issue":
    case "security_alert": {
      // Urgent — minimal copy, no emoji.
      const block = mdV2Block({
        title: lang === "th" ? "ด่วน" : "URGENT",
        subtitle: `${m.guest_name ?? m.unit_name ?? "Issue"}${m.unit_name && m.guest_name ? ` · ${m.unit_name}` : ""}`,
        body: String(m.detail ?? m.reason ?? m.event_type ?? "Open the app for details").slice(0, 240),
        urgent: true,
      });
      return make(block, [
        { label: pick(L.respond, lang), data: `urgent:respond:${m.subject_id ?? m.booking_id ?? ""}` },
        { label: pick(L.openApp, lang), data: "urgent:open" },
      ]);
    }

    case "weather_update":
    case "local_intel_update": {
      if (!m.title && !m.body) return null;
      const greet = rotateGreeting(
        lang === "th" ? ["อัปเดตเกาะ", "ข่าวพื้นที่"] : ["Island update", "Local intel"],
      );
      const block = mdV2Block({ title: m.title ?? greet, body: m.body ? String(m.body).slice(0, 240) : undefined });
      const buttons: RichButton[] = m.action_label && m.action_uri
        ? [{ label: m.action_label, uri: m.action_uri }]
        : [{ label: pick(L.tellMore, lang), data: `intel:${m.id ?? ""}` }];
      return make(block, buttons);
    }

    default:
      // Suppress lint about unused role param — reserved for future role-gated rich variants.
      void role;
      return null;
  }
}

export function buildWhatsAppForEvent(
  eventType: string,
  metadata: Record<string, any>,
  lang: RichLang = "en",
  role: Role = "guest",
): WhatsAppIntent | null {
  const m = metadata ?? {};
  void role;

  switch (eventType) {
    case "arrival_stage_1_guest": {
      const greet = rotateGreeting(
        lang === "th" ? ["พรุ่งนี้ถึงแล้ว", "อีกวันเดียว"] : ["Tomorrow's the day", "One sleep to go"],
      );
      return {
        kind: "reply_buttons",
        headerText: greet,
        body: lang === "th"
          ? `เช็คอินจาก ${m.check_in_time ?? "16:00"} ที่ ${m.property_name ?? "ที่พัก"}\nนำบัตรประชาชน + เลขจอง`
          : `Check-in from ${m.check_in_time ?? "16:00"} at ${m.property_name ?? "the property"}.\nBring ID + booking ref.`,
        buttons: [
          { label: pick(L.gotIt, lang), data: `ack:arrival_1:${m.booking_id ?? ""}` },
          { label: pick(L.tellMore, lang), data: `arrival:tellmore:${m.booking_id ?? ""}` },
        ],
        footer: "Kru Glitch",
      };
    }

    case "arrival_stage_4_guest":
    case "room_ready_guest":
    case "room_ready": {
      const isReady = eventType === "room_ready" || eventType === "room_ready_guest";
      const head = isReady
        ? rotateGreeting(lang === "th" ? ["ห้องพร้อมแล้ว", "เข้าได้เลย"] : ["Your room's ready", "Room's good to go"])
        : rotateGreeting(lang === "th" ? ["เช็คอินเรียบร้อย 🥊"] : ["You're checked in 🥊"]);
      return {
        kind: "reply_buttons",
        headerText: head,
        body: `${m.unit_name ?? ""}${m.wifi ? `\nWiFi: ${m.wifi}` : ""}`.trim() || (lang === "th" ? "ทุกอย่างพร้อม" : "All set."),
        buttons: [
          { label: pick(L.gotIt, lang), data: `ack:${eventType}:${m.booking_id ?? ""}` },
          { label: pick(L.tellMore, lang), data: `arrival:tellmore:${m.booking_id ?? ""}` },
        ],
      };
    }

    case "booking_approval_needed": {
      return {
        kind: "reply_buttons",
        headerText: lang === "th" ? "รออนุมัติ" : "Approval needed",
        body: `${m.guest_name ?? "Guest"} · ${m.unit_name ?? "Unit"}\n${lang === "th" ? "เช็คอิน" : "Check-in"}: ${m.check_in ?? "?"}`,
        buttons: [
          { label: lang === "th" ? "อนุมัติ" : "Approve", data: `booking:approve:${m.booking_id ?? ""}` },
          { label: lang === "th" ? "ปฏิเสธ" : "Decline", data: `booking:decline:${m.booking_id ?? ""}` },
          { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
        ],
      };
    }

    case "booking_confirmed": {
      return {
        kind: "reply_buttons",
        headerText: lang === "th" ? "ยืนยันการจองแล้ว" : "Booking confirmed",
        body: `${m.unit_name ?? ""}\n${m.check_in ?? "?"} → ${m.check_out ?? "?"}`,
        buttons: [
          { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
          { label: pick(L.tellMore, lang), data: `booking:tellmore:${m.booking_id ?? ""}` },
        ],
      };
    }

    case "checkin_due": {
      return {
        kind: "reply_buttons",
        headerText: lang === "th" ? "เช็คอินวันนี้" : "Check-in due today",
        body: `${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"}`,
        buttons: [
          { label: lang === "th" ? "เช็คอินเลย" : "Check them in", data: `booking:checkin:${m.booking_id ?? ""}` },
          { label: pick(L.viewBooking, lang), data: `booking:view:${m.booking_id ?? ""}` },
        ],
      };
    }

    case "daily_briefing": {
      const items: RichListItem[] = [];
      if (m.occupancy != null)           items.push({ title: lang === "th" ? "เข้าพัก" : "Occupancy", description: String(m.occupancy), data: "briefing:occupancy" });
      if (m.arrivals_today != null)      items.push({ title: lang === "th" ? "มาวันนี้" : "Arrivals", description: String(m.arrivals_today), data: "briefing:arrivals" });
      if (m.departures_today != null)    items.push({ title: lang === "th" ? "ออกวันนี้" : "Departures", description: String(m.departures_today), data: "briefing:departures" });
      if (m.pending_maintenance != null) items.push({ title: lang === "th" ? "ซ่อมค้าง" : "Maintenance", description: String(m.pending_maintenance), data: "briefing:maintenance" });
      if (m.payment_flags != null)       items.push({ title: lang === "th" ? "ชำระเงิน" : "Payments", description: String(m.payment_flags), data: "briefing:payments" });
      if (!items.length) return null;
      return {
        kind: "list",
        headerText: rotateGreeting(lang === "th" ? ["สรุปวันนี้"] : ["Morning briefing", "Today at a glance"]),
        body: lang === "th" ? "แตะรายการเพื่อดูรายละเอียด" : "Tap a row to drill in.",
        buttonLabel: pick(L.menu, lang),
        sections: [{ title: lang === "th" ? "วันนี้" : "Today", items }],
      };
    }

    case "urgent_issue":
    case "security_alert": {
      // Urgent — no emoji, direct copy, two action buttons max.
      return {
        kind: "reply_buttons",
        headerText: lang === "th" ? "ด่วน" : "URGENT",
        body: `${m.guest_name ?? m.unit_name ?? "Issue"}${m.unit_name && m.guest_name ? ` · ${m.unit_name}` : ""}\n${String(m.detail ?? m.reason ?? "Open the app for details").slice(0, 240)}`,
        buttons: [
          { label: pick(L.respond, lang), data: `urgent:respond:${m.subject_id ?? m.booking_id ?? ""}` },
          { label: pick(L.openApp, lang), data: "urgent:open" },
        ],
      };
    }

    case "weather_update":
    case "local_intel_update": {
      if (!m.title && !m.body) return null;
      // If there's a hero image, prefer media + caption.
      if (m.image_url) {
        return {
          kind: "media",
          mediaUrl: m.image_url,
          caption: `${m.title ?? ""}\n${String(m.body ?? "").slice(0, 800)}`.trim(),
        };
      }
      return {
        kind: "reply_buttons",
        headerText: rotateGreeting(lang === "th" ? ["อัปเดตเกาะ"] : ["Island update", "Local intel"]),
        body: `${m.title ? `*${m.title}*\n` : ""}${String(m.body ?? "").slice(0, 800)}`.trim(),
        buttons: [{ label: pick(L.tellMore, lang), data: `intel:${m.id ?? ""}` }],
      };
    }

    default:
      return null;
  }
}
