import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import { generateMockData, type SimulationData, type MockBooking, type MockMessage, type MockMaintenanceRequest, type MockLaundryRequest } from "./mockData";
import type { AppRole } from "@/lib/permissions";

export type ActorLogType = "response" | "escalation" | "chaos" | "suppressed";
export type ActorDifficulty = "calm" | "neutral" | "demanding" | "chaos";

export interface ActorLogEntry {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
  type?: ActorLogType;
}

export interface ActorMemoryEntry {
  actor: string;
  summary: string;
  tone: "neutral" | "frustrated" | "grateful" | "urgent";
  unresolved: boolean;
  timestamp: string;
}

interface SimulationContextType {
  isSimulation: boolean;
  data: SimulationData;
  simulatedRole: AppRole;
  setSimulatedRole: (role: AppRole) => void;
  transitionBooking: (id: string, newState: MockBooking["state"]) => void;
  createBooking: (booking: Omit<MockBooking, "id" | "created_at">) => string;
  sendMessage: (msg: Omit<MockMessage, "id" | "created_at">) => void;
  updateMaintenanceStatus: (id: string, status: string, note?: string) => void;
  updateLaundryStatus: (id: string, status: string) => void;
  activeMission: string | null;
  setActiveMission: (id: string | null) => void;
  missionStep: number;
  setMissionStep: (step: number) => void;
  completedMissions: string[];
  completeMission: (id: string) => void;
  actorLog: ActorLogEntry[];
  addActorLog: (entry: Omit<ActorLogEntry, "id" | "timestamp">) => void;
  /** Per-actor session memory */
  actorMemory: Record<string, ActorMemoryEntry[]>;
  addActorMemory: (entry: Omit<ActorMemoryEntry, "timestamp">) => void;
  clearActorMemory: () => void;
  /** Difficulty setting */
  actorDifficulty: ActorDifficulty;
  setActorDifficulty: (d: ActorDifficulty) => void;
  /** Typing indicator */
  actorTyping: { actor: string; bookingId: string; guestName: string } | null;
  setActorTyping: (v: { actor: string; bookingId: string; guestName: string } | null) => void;
  /** Inject chaos events into data */
  addMaintenanceRequest: (req: Omit<MockMaintenanceRequest, "id" | "created_at">) => void;
  addLaundryRequest: (req: Omit<MockLaundryRequest, "id" | "created_at">) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

const COMPLETED_KEY = "gs_sim_completed_missions";

function loadCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COMPLETED_KEY) || "[]");
  } catch {
    return [];
  }
}

let nextId = 100;
function simId(prefix: string) {
  return `${prefix}-${++nextId}`;
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SimulationData>(() => generateMockData());
  const [simulatedRole, setSimulatedRole] = useState<AppRole>("admin");
  const [activeMission, setActiveMission] = useState<string | null>(null);
  const [missionStep, setMissionStep] = useState(0);
  const [completedMissions, setCompleted] = useState<string[]>(loadCompleted);
  const [actorLog, setActorLog] = useState<ActorLogEntry[]>([]);
  const [actorMemory, setActorMemory] = useState<Record<string, ActorMemoryEntry[]>>({});
  const [actorDifficulty, setActorDifficulty] = useState<ActorDifficulty>("neutral");
  const [actorTyping, setActorTyping] = useState<{ actor: string; bookingId: string; guestName: string } | null>(null);

  const transitionBooking = useCallback((id: string, newState: MockBooking["state"]) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) =>
        b.id === id ? { ...b, state: newState } : b
      ),
    }));
  }, []);

  const createBooking = useCallback((booking: Omit<MockBooking, "id" | "created_at">): string => {
    const id = simId("sim-bk");
    setData((prev) => ({
      ...prev,
      bookings: [{ ...booking, id, created_at: new Date().toISOString().split("T")[0] }, ...prev.bookings],
    }));
    return id;
  }, []);

  const sendMessage = useCallback((msg: Omit<MockMessage, "id" | "created_at">) => {
    setData((prev) => ({
      ...prev,
      messages: [...prev.messages, { ...msg, id: simId("sim-msg"), created_at: new Date().toISOString() }],
    }));
  }, []);

  const updateMaintenanceStatus = useCallback((id: string, status: string, note?: string) => {
    setData((prev) => ({
      ...prev,
      maintenanceRequests: prev.maintenanceRequests.map((r) =>
        r.id === id ? { ...r, status, ...(note ? { resolution_note: note } : {}) } : r
      ),
    }));
  }, []);

  const updateLaundryStatus = useCallback((id: string, status: string) => {
    setData((prev) => ({
      ...prev,
      laundryRequests: prev.laundryRequests.map((r) =>
        r.id === id ? { ...r, status } : r
      ),
    }));
  }, []);

  const addMaintenanceRequest = useCallback((req: Omit<MockMaintenanceRequest, "id" | "created_at">) => {
    setData((prev) => ({
      ...prev,
      maintenanceRequests: [
        ...prev.maintenanceRequests,
        { ...req, id: simId("sim-maint"), created_at: new Date().toISOString() } as MockMaintenanceRequest,
      ],
    }));
  }, []);

  const addLaundryRequest = useCallback((req: Omit<MockLaundryRequest, "id" | "created_at">) => {
    setData((prev) => ({
      ...prev,
      laundryRequests: [
        ...prev.laundryRequests,
        { ...req, id: simId("sim-lnd"), created_at: new Date().toISOString() } as MockLaundryRequest,
      ],
    }));
  }, []);

  const completeMission = useCallback((id: string) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
      return next;
    });
    setActiveMission(null);
    setMissionStep(0);
  }, []);

  const addActorLog = useCallback((entry: Omit<ActorLogEntry, "id" | "timestamp">) => {
    setActorLog((prev) => [
      { ...entry, id: simId("log"), timestamp: new Date().toISOString() },
      ...prev,
    ].slice(0, 50));
  }, []);

  const addActorMemory = useCallback((entry: Omit<ActorMemoryEntry, "timestamp">) => {
    setActorMemory((prev) => {
      const existing = prev[entry.actor] || [];
      const updated = [...existing, { ...entry, timestamp: new Date().toISOString() }].slice(-20);
      return { ...prev, [entry.actor]: updated };
    });
  }, []);

  const clearActorMemory = useCallback(() => {
    setActorMemory({});
  }, []);

  const value = useMemo(
    () => ({
      isSimulation: true,
      data,
      simulatedRole,
      setSimulatedRole,
      transitionBooking,
      createBooking,
      sendMessage,
      updateMaintenanceStatus,
      updateLaundryStatus,
      activeMission,
      setActiveMission,
      missionStep,
      setMissionStep,
      completedMissions,
      completeMission,
      actorLog,
      addActorLog,
      actorMemory,
      addActorMemory,
      clearActorMemory,
      actorDifficulty,
      setActorDifficulty,
      actorTyping,
      setActorTyping,
      addMaintenanceRequest,
      addLaundryRequest,
    }),
    [data, simulatedRole, activeMission, missionStep, completedMissions, actorLog, actorMemory, actorDifficulty, actorTyping, transitionBooking, createBooking, sendMessage, updateMaintenanceStatus, updateLaundryStatus, completeMission, addActorLog, addActorMemory, clearActorMemory, addMaintenanceRequest, addLaundryRequest]
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used within SimulationProvider");
  return ctx;
}
