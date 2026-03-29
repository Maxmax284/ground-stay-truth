// Fenrir Lock Security Integration — barrel export
export { fenrirDispatcher } from "./dispatcher";
export { useFenrirConfig, useFenrirEmit, useSecurityFreeze } from "./hooks";
export { mapRole } from "./role-map";
export { FENRIR_POLICY_KEYS } from "./config";
export type { FenrirEvent, FenrirEventType, FenrirSeverity, FenrirRole, FenrirCommand } from "./types";
