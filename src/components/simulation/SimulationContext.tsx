import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { generateMockData, type SimulationData, type MockBooking } from "./mockData";
import type { AppRole } from "@/lib/permissions";

interface SimulationContextType {
  isSimulation: boolean;
  data: SimulationData;
  simulatedRole: AppRole;
  setSimulatedRole: (role: AppRole) => void;
  /** Transition a mock booking to a new state */
  transitionBooking: (id: string, newState: MockBooking["state"]) => void;
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

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SimulationData>(() => generateMockData());
  const [simulatedRole, setSimulatedRole] = useState<AppRole>("admin");
  const [activeMission, setActiveMission] = useState<string | null>(null);
  const [missionStep, setMissionStep] = useState(0);
  const [completedMissions, setCompleted] = useState<string[]>(loadCompleted);

  const transitionBooking = (id: string, newState: MockBooking["state"]) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) =>
        b.id === id ? { ...b, state: newState } : b
      ),
    }));
  };

  const completeMission = (id: string) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
      return next;
    });
    setActiveMission(null);
    setMissionStep(0);
  };

  const value = useMemo(
    () => ({
      isSimulation: true,
      data,
      simulatedRole,
      setSimulatedRole,
      transitionBooking,
      activeMission,
      setActiveMission,
      missionStep,
      setMissionStep,
      completedMissions,
      completeMission,
    }),
    [data, simulatedRole, activeMission, missionStep, completedMissions]
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
