import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import { generateMockData, type SimulationData, type MockBooking, type MockMessage, type MockMaintenanceRequest, type MockLaundryRequest } from "./mockData";
import type { AppRole } from "@/lib/permissions";

interface SimulationContextType {
  isSimulation: boolean;
  data: SimulationData;
  simulatedRole: AppRole;
  setSimulatedRole: (role: AppRole) => void;
  /** Transition a mock booking to a new state */
  transitionBooking: (id: string, newState: MockBooking["state"]) => void;
  /** Create a new mock booking */
  createBooking: (booking: Omit<MockBooking, "id" | "created_at">) => string;
  /** Send a mock message */
  sendMessage: (msg: Omit<MockMessage, "id" | "created_at">) => void;
  /** Update maintenance request status */
  updateMaintenanceStatus: (id: string, status: string, note?: string) => void;
  /** Update laundry request status */
  updateLaundryStatus: (id: string, status: string) => void;
  /** Current active mission id (null = none) */
  activeMission: string | null;
  setActiveMission: (id: string | null) => void;
  missionStep: number;
  setMissionStep: (step: number) => void;
  /** Track completed missions in localStorage */
  completedMissions: string[];
  completeMission: (id: string) => void;
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

  const completeMission = useCallback((id: string) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
      return next;
    });
    setActiveMission(null);
    setMissionStep(0);
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
    }),
    [data, simulatedRole, activeMission, missionStep, completedMissions, transitionBooking, createBooking, sendMessage, updateMaintenanceStatus, updateLaundryStatus, completeMission]
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
