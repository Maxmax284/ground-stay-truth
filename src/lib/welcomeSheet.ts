/** Paper-binder welcome sheet content, stored in policy_settings key "welcome_sheet". */
export interface EmergencyContact { label: string; phone: string }
export interface WelcomeSheet {
  welcome: string;
  reception: string;
  services: string;
  housekeeping: string;
  general: string;
  emergency: EmergencyContact[];
}

export const EMPTY_WELCOME_SHEET: WelcomeSheet = {
  welcome: "", reception: "", services: "", housekeeping: "", general: "", emergency: [],
};

export function parseWelcomeSheet(value: unknown): WelcomeSheet {
  let v: any = value;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = {}; } }
  if (!v || typeof v !== "object") v = {};
  const s = (k: string) => (typeof v[k] === "string" ? v[k] : "");
  return {
    welcome: s("welcome"), reception: s("reception"), services: s("services"),
    housekeeping: s("housekeeping"), general: s("general"),
    emergency: Array.isArray(v.emergency)
      ? v.emergency.filter((e: any) => e && (e.label || e.phone)).map((e: any) => ({ label: String(e.label ?? ""), phone: String(e.phone ?? "") }))
      : [],
  };
}
