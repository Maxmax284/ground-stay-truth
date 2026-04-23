// Shared LINE Flex Message + Carousel builders for Kru Glitch.
// Presentation-only: business logic, tone, and copy are produced by callers.
// All builders accept an `altText` for plain-text fallback (LINE notifications,
// older clients) and a `lang` hint for minimal localization of static labels.
//
// LINE Flex spec: https://developers.line.biz/en/reference/messaging-api/#flex-message

export type LineLang = "en" | "th" | "de" | "fr" | "ru" | "zh" | "ja" | "ko" | "es";

// Tiny localized button label dictionary. Keep terse, human, never corporate.
const L = {
  letsGo:    { en: "Let's go",       th: "ไปกันเลย",     de: "Los geht's",    fr: "C'est parti",  ru: "Поехали",    zh: "走吧",     ja: "行こう",     ko: "가자",        es: "Vamos" },
  gotIt:     { en: "Got it",         th: "รับทราบ",       de: "Verstanden",    fr: "Compris",      ru: "Понял",      zh: "知道了",   ja: "了解",       ko: "알겠어요",    es: "Entendido" },
  tellMore:  { en: "Tell me more",   th: "บอกเพิ่ม",      de: "Mehr erzählen", fr: "En savoir plus", ru: "Подробнее", zh: "告诉我更多", ja: "もっと教えて", ko: "더 알려줘",   es: "Cuéntame más" },
  openApp:   { en: "Open app",       th: "เปิดแอป",       de: "App öffnen",    fr: "Ouvrir l'app", ru: "Открыть",    zh: "打开应用", ja: "アプリを開く", ko: "앱 열기",     es: "Abrir app" },
  viewBooking: { en: "View booking", th: "ดูการจอง",      de: "Buchung",       fr: "Réservation",  ru: "Бронь",      zh: "查看预订", ja: "予約を見る", ko: "예약 보기",   es: "Ver reserva" },
  respond:   { en: "Respond now",    th: "ตอบเลย",        de: "Jetzt reagieren", fr: "Répondre",   ru: "Ответить",   zh: "立即回应", ja: "今すぐ対応", ko: "지금 응답",   es: "Responder" },
};

function pick(dict: typeof L.letsGo, lang: LineLang): string {
  return (dict as any)[lang] ?? dict.en;
}

// Color tokens — match the warm/operational Kru Glitch palette. HSL not supported in Flex; use hex.
const COLORS = {
  primary:   "#C8A86A",   // brand gold
  text:      "#1F1F1F",
  muted:     "#6B6B6B",
  surface:   "#FFFFFF",
  urgent:    "#C0392B",
  urgentBg:  "#FBECEA",
  success:   "#2E7D5B",
  warn:      "#B8860B",
};

interface FlexButton {
  label: string;
  data?: string;       // postback data
  uri?: string;        // url action
  style?: "primary" | "secondary";
  color?: string;
}

// ── Event card (arrival stages, room ready, weather/intel) ──
export interface EventCardOpts {
  altText: string;
  title: string;          // e.g. "You're checked in" — already in Kru Glitch voice
  subtitle?: string;      // e.g. unit name / check-in time
  body?: string;          // 1–2 lines, optional
  stageLabel?: string;    // small chip e.g. "Stage 4 · Check-in"
  heroUrl?: string;       // optional hero image
  button?: FlexButton;
  urgent?: boolean;       // strips emoji styling, switches to urgent palette
  lang?: LineLang;
}

export function buildEventCard(opts: EventCardOpts) {
  const {
    altText, title, subtitle, body, stageLabel, heroUrl, button, urgent = false,
  } = opts;

  const headerColor = urgent ? COLORS.urgent : COLORS.primary;
  const bgColor = urgent ? COLORS.urgentBg : COLORS.surface;

  const bubble: any = {
    type: "bubble",
    size: "kilo",
    styles: {
      body: { backgroundColor: bgColor },
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [],
    },
  };

  if (heroUrl && !urgent) {
    bubble.hero = {
      type: "image",
      url: heroUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }

  if (stageLabel) {
    bubble.body.contents.push({
      type: "text",
      text: stageLabel,
      size: "xs",
      color: headerColor,
      weight: "bold",
    });
  }

  bubble.body.contents.push({
    type: "text",
    text: title,
    weight: "bold",
    size: "lg",
    color: COLORS.text,
    wrap: true,
  });

  if (subtitle) {
    bubble.body.contents.push({
      type: "text",
      text: subtitle,
      size: "sm",
      color: COLORS.muted,
      wrap: true,
    });
  }

  if (body) {
    bubble.body.contents.push({
      type: "text",
      text: body,
      size: "sm",
      color: COLORS.text,
      wrap: true,
      margin: "md",
    });
  }

  if (button) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [{
        type: "button",
        style: button.style ?? "primary",
        color: button.color ?? headerColor,
        height: "sm",
        action: button.uri
          ? { type: "uri", label: button.label, uri: button.uri }
          : { type: "postback", label: button.label, data: button.data ?? "noop", displayText: button.label },
      }],
    };
  }

  return { type: "flex", altText: altText.slice(0, 400), contents: bubble };
}

// ── Daily briefing card (staff/admin) ──
export interface BriefingMetric { label: string; value: string | number; tone?: "default" | "warn" | "urgent" | "success" }
export interface BriefingCardOpts {
  altText: string;
  greeting: string;       // rotated by caller
  date: string;           // already formatted (timezone aware)
  metrics: BriefingMetric[];
  lang?: LineLang;
}

export function buildBriefingCard(opts: BriefingCardOpts) {
  const rows = opts.metrics.map((m) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: m.label, size: "sm", color: COLORS.muted, flex: 5, wrap: true },
      {
        type: "text",
        text: String(m.value),
        size: "sm",
        weight: "bold",
        align: "end",
        flex: 2,
        color: m.tone === "urgent" ? COLORS.urgent : m.tone === "warn" ? COLORS.warn : m.tone === "success" ? COLORS.success : COLORS.text,
      },
    ],
  }));

  const bubble = {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: opts.greeting, weight: "bold", size: "md", color: COLORS.text, wrap: true },
        { type: "text", text: opts.date, size: "xs", color: COLORS.muted },
        { type: "separator", margin: "sm" },
        { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: rows },
      ],
    },
  };

  return { type: "flex", altText: opts.altText.slice(0, 400), contents: bubble };
}

// ── Escalation alert (urgent — minimal, no emoji) ──
export interface EscalationCardOpts {
  altText: string;
  guestName: string;
  summary: string;
  unit?: string;
  button?: FlexButton;
  lang?: LineLang;
}

export function buildEscalationCard(opts: EscalationCardOpts) {
  const lang: LineLang = opts.lang ?? "en";
  const button: FlexButton = opts.button ?? { label: pick(L.respond, lang) };

  return buildEventCard({
    altText: opts.altText,
    title: opts.guestName + (opts.unit ? ` · ${opts.unit}` : ""),
    body: opts.summary,
    stageLabel: lang === "th" ? "ด่วน" : "URGENT",
    urgent: true,
    button,
    lang,
  });
}

// ── Carousel: rooms / units ──
export interface RoomCard {
  name: string;
  description?: string;
  status?: string;        // e.g. "Available", "ว่าง"
  imageUrl?: string;
  buttonLabel?: string;
  buttonData?: string;    // postback payload
  buttonUri?: string;
}

export function buildRoomsCarousel(opts: { altText: string; rooms: RoomCard[]; lang?: LineLang }) {
  const lang = opts.lang ?? "en";
  const bubbles = opts.rooms.slice(0, 10).map((r) => {
    const bubble: any = {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: r.name, weight: "bold", size: "sm", wrap: true, color: COLORS.text },
        ],
      },
    };
    if (r.imageUrl) {
      bubble.hero = { type: "image", url: r.imageUrl, size: "full", aspectRatio: "1:1", aspectMode: "cover" };
    }
    if (r.status) {
      bubble.body.contents.push({ type: "text", text: r.status, size: "xxs", color: COLORS.muted });
    }
    if (r.description) {
      bubble.body.contents.push({ type: "text", text: r.description, size: "xxs", color: COLORS.muted, wrap: true, margin: "sm" });
    }
    bubble.footer = {
      type: "box",
      layout: "vertical",
      contents: [{
        type: "button",
        style: "primary",
        color: COLORS.primary,
        height: "sm",
        action: r.buttonUri
          ? { type: "uri", label: r.buttonLabel ?? pick(L.tellMore, lang), uri: r.buttonUri }
          : { type: "postback", label: r.buttonLabel ?? pick(L.tellMore, lang), data: r.buttonData ?? `room:${r.name}`, displayText: r.buttonLabel ?? pick(L.tellMore, lang) },
      }],
    };
    return bubble;
  });

  return {
    type: "flex",
    altText: opts.altText.slice(0, 400),
    contents: { type: "carousel", contents: bubbles },
  };
}

// ── Carousel: ferry schedule slots ──
export interface FerrySlot {
  operator: string;       // e.g. "Lomprayah"
  departure: string;      // "08:00"
  arrival?: string;       // "10:30"
  route?: string;         // "Donsak → Samui"
  price?: string;         // "350 THB"
  buttonLabel?: string;
  buttonData?: string;
  buttonUri?: string;
}

export function buildFerryCarousel(opts: { altText: string; slots: FerrySlot[]; lang?: LineLang }) {
  const lang = opts.lang ?? "en";
  const bubbles = opts.slots.slice(0, 10).map((s) => ({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: s.departure + (s.arrival ? ` → ${s.arrival}` : ""), weight: "bold", size: "md", color: COLORS.text },
        { type: "text", text: s.operator, size: "xs", color: COLORS.muted },
        ...(s.route ? [{ type: "text", text: s.route, size: "xxs", color: COLORS.muted, wrap: true }] : []),
        ...(s.price ? [{ type: "text", text: s.price, size: "xs", color: COLORS.primary, weight: "bold", margin: "sm" }] : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{
        type: "button",
        style: "primary",
        color: COLORS.primary,
        height: "sm",
        action: s.buttonUri
          ? { type: "uri", label: s.buttonLabel ?? pick(L.tellMore, lang), uri: s.buttonUri }
          : { type: "postback", label: s.buttonLabel ?? pick(L.tellMore, lang), data: s.buttonData ?? `ferry:${s.operator}:${s.departure}`, displayText: s.buttonLabel ?? pick(L.tellMore, lang) },
      }],
    },
  }));

  return {
    type: "flex",
    altText: opts.altText.slice(0, 400),
    contents: { type: "carousel", contents: bubbles },
  };
}

// ── Carousel: current guests (staff) ──
export interface GuestCard {
  name: string;
  unit: string;
  arrival?: string;       // formatted date/time
  departure?: string;
  status: string;         // "Checked in", "Arriving today"
  buttonLabel?: string;
  buttonData?: string;
  buttonUri?: string;
}

export function buildGuestsCarousel(opts: { altText: string; guests: GuestCard[]; lang?: LineLang }) {
  const lang = opts.lang ?? "en";
  const bubbles = opts.guests.slice(0, 10).map((g) => ({
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: g.name, weight: "bold", size: "sm", color: COLORS.text, wrap: true },
        { type: "text", text: g.unit, size: "xs", color: COLORS.muted },
        { type: "text", text: g.status, size: "xxs", color: COLORS.success, weight: "bold", margin: "sm" },
        ...(g.arrival ? [{ type: "text", text: `In: ${g.arrival}`, size: "xxs", color: COLORS.muted }] : []),
        ...(g.departure ? [{ type: "text", text: `Out: ${g.departure}`, size: "xxs", color: COLORS.muted }] : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [{
        type: "button",
        style: "secondary",
        height: "sm",
        action: g.buttonUri
          ? { type: "uri", label: g.buttonLabel ?? pick(L.viewBooking, lang), uri: g.buttonUri }
          : { type: "postback", label: g.buttonLabel ?? pick(L.viewBooking, lang), data: g.buttonData ?? `guest:${g.name}`, displayText: g.buttonLabel ?? pick(L.viewBooking, lang) },
      }],
    },
  }));

  return {
    type: "flex",
    altText: opts.altText.slice(0, 400),
    contents: { type: "carousel", contents: bubbles },
  };
}

// Helper: rotate header/greeting copy to avoid static repetition.
export function rotateGreeting(pool: string[], seed?: string | number): string {
  if (pool.length === 0) return "";
  const s = typeof seed === "number" ? seed : (seed ?? "").toString().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = (s + Date.now()) % pool.length;
  return pool[Math.abs(idx) % pool.length];
}

// Map an event_type + metadata to an optional Flex message. Returns null if
// the event has no rich-format upgrade — caller should fall back to plain text.
export function buildFlexForEvent(eventType: string, metadata: Record<string, any>, lang: LineLang = "en"): any | null {
  const m = metadata ?? {};

  switch (eventType) {
    case "arrival_stage_1_guest": {
      const greet = rotateGreeting(
        lang === "th"
          ? ["พรุ่งนี้ถึงแล้ว", "อีกวันเดียว", "พรุ่งนี้เจอกัน"]
          : ["Tomorrow's the day", "One sleep to go", "See you tomorrow"],
        m.unit_name,
      );
      return buildEventCard({
        altText: `${greet} — check-in from ${m.check_in_time ?? "16:00"}`,
        stageLabel: lang === "th" ? "ขั้นที่ 1 · ก่อนถึง" : "Stage 1 · Pre-arrival",
        title: greet,
        subtitle: `${m.property_name ?? "Property"} · ${m.check_in_time ?? "16:00"}`,
        body: lang === "th"
          ? "นำบัตรประชาชนหรือพาสปอร์ต + เลขจอง ส่งข้อความหาผมได้ตลอด"
          : "Bring ID + booking ref. Message me anytime — Kru Glitch.",
        button: { label: pick(L.openApp, lang), data: `booking:${m.booking_id ?? ""}` },
        lang,
      });
    }

    case "arrival_stage_3_guest":
    case "arrival_stage_4_guest":
    case "room_ready_guest":
    case "room_ready": {
      const isReady = eventType === "room_ready" || eventType === "room_ready_guest";
      const isCheckedIn = eventType === "arrival_stage_4_guest";
      const titles = isReady
        ? (lang === "th" ? ["ห้องพร้อมแล้ว", "เข้าได้เลย"] : ["Your room's ready", "Room's good to go"])
        : isCheckedIn
        ? (lang === "th" ? ["เช็คอินเรียบร้อย 🥊", "ถึงแล้ว เริ่มเลย"] : ["You're checked in 🥊", "You're in"])
        : (lang === "th" ? ["ใกล้ถึงแล้ว", "อีกนิดเดียว"] : ["Almost there", "Closing in"]);
      return buildEventCard({
        altText: `${titles[0]} — ${m.unit_name ?? "your unit"}`,
        stageLabel: isCheckedIn ? (lang === "th" ? "ขั้นที่ 4 · เช็คอิน" : "Stage 4 · Check-in")
                  : isReady    ? (lang === "th" ? "ห้องพร้อม" : "Room ready")
                              : (lang === "th" ? "ขั้นที่ 3 · กำลังมาถึง" : "Stage 3 · Inbound"),
        title: rotateGreeting(titles, m.unit_name),
        subtitle: m.unit_name ?? undefined,
        body: m.wifi
          ? (lang === "th" ? `WiFi: ${m.wifi}` : `WiFi: ${m.wifi}`)
          : (m.address ? String(m.address).slice(0, 120) : undefined),
        button: { label: pick(L.gotIt, lang), data: `ack:${eventType}:${m.booking_id ?? ""}` },
        lang,
      });
    }

    case "daily_briefing": {
      const greet = rotateGreeting(
        lang === "th" ? ["สรุปวันนี้", "เริ่มวันกัน", "ภาพรวมวันนี้"] : ["Morning briefing", "Today at a glance", "Here's the day"],
      );
      const metrics: BriefingMetric[] = [];
      if (m.occupancy != null)         metrics.push({ label: lang === "th" ? "เข้าพัก" : "Occupancy",    value: m.occupancy });
      if (m.arrivals_today != null)    metrics.push({ label: lang === "th" ? "มาวันนี้" : "Arrivals today",   value: m.arrivals_today });
      if (m.departures_today != null)  metrics.push({ label: lang === "th" ? "ออกวันนี้" : "Departures today", value: m.departures_today });
      if (m.pending_maintenance != null) metrics.push({ label: lang === "th" ? "ซ่อมค้าง" : "Pending maintenance", value: m.pending_maintenance, tone: Number(m.pending_maintenance) > 0 ? "warn" : "default" });
      if (m.payment_flags != null)     metrics.push({ label: lang === "th" ? "ชำระเงินแจ้งเตือน" : "Payment flags", value: m.payment_flags, tone: Number(m.payment_flags) > 0 ? "urgent" : "success" });
      if (metrics.length === 0) return null;
      return buildBriefingCard({
        altText: `${greet}: ${metrics.map(x => `${x.label} ${x.value}`).join(", ")}`,
        greeting: greet,
        date: String(m.date ?? new Date().toISOString().slice(0, 10)),
        metrics,
        lang,
      });
    }

    case "urgent_issue":
    case "security_alert": {
      return buildEscalationCard({
        altText: `URGENT: ${m.unit_name ?? m.event_type ?? "issue"} — ${m.detail ?? m.severity ?? "see app"}`,
        guestName: m.guest_name ?? m.unit_name ?? "Issue",
        unit: m.unit_name,
        summary: String(m.detail ?? m.reason ?? m.event_type ?? "Open the app for details").slice(0, 240),
        lang,
      });
    }

    case "weather_update":
    case "local_intel_update": {
      const greet = rotateGreeting(
        lang === "th" ? ["อัปเดตเกาะ", "ข่าวพื้นที่"] : ["Island update", "Local intel", "Heads up from Kru Glitch"],
      );
      if (!m.title && !m.body) return null;
      return buildEventCard({
        altText: `${greet}: ${m.title ?? m.body ?? ""}`.slice(0, 200),
        stageLabel: lang === "th" ? "ข้อมูลพื้นที่" : "Local intel",
        title: m.title ?? greet,
        body: m.body ? String(m.body).slice(0, 240) : undefined,
        heroUrl: m.image_url,
        button: m.action_label && m.action_uri
          ? { label: m.action_label, uri: m.action_uri }
          : { label: pick(L.tellMore, lang), data: `intel:${m.id ?? ""}` },
        lang,
      });
    }

    default:
      return null;
  }
}
