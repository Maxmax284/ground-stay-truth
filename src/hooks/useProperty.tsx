import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Property {
  id: string;
  slug: string;
  name: string;
  operational_mode: "high_turnover" | "long_stay";
  timezone: string;
  settings: Record<string, any>;
  is_active: boolean;
}

interface PropertyAssignment {
  id: string;
  property_id: string;
  is_default: boolean;
  properties: Property;
}

interface PropertyContextValue {
  /** The currently active property (null while loading) */
  activeProperty: Property | null;
  /** All properties the user has access to */
  properties: Property[];
  /** Switch to a different property (umbrella operators only) */
  switchProperty: (propertyId: string) => void;
  /** True if user has access to 2+ properties */
  isUmbrella: boolean;
  /** Shorthand for the active property's operational mode */
  operationalMode: "high_turnover" | "long_stay" | null;
  /** Active property ID — pass to data hooks */
  activePropertyId: string | null;
  /** Whether property data is still loading */
  isLoading: boolean;
}

const PropertyContext = createContext<PropertyContextValue>({
  activeProperty: null,
  properties: [],
  switchProperty: () => {},
  isUmbrella: false,
  operationalMode: null,
  activePropertyId: null,
  isLoading: true,
});

const STORAGE_KEY = "ground-stay-active-property";

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [activePropertyId, setActivePropertyId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Fetch user's property assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["user_property_assignments", user?.id],
    enabled: !!user && role !== "guest",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_property_assignments" as any)
        .select("id, property_id, is_default, properties:properties(*)")
        .eq("user_id", user!.id) as any;
      if (error) throw error;
      return (data ?? []) as PropertyAssignment[];
    },
  });

  const properties = useMemo(
    () => (assignments ?? []).map((a) => a.properties).filter(Boolean),
    [assignments]
  );

  const isUmbrella = properties.length > 1;

  // Auto-select property if none selected or current selection is invalid
  useEffect(() => {
    if (!assignments || assignments.length === 0) return;

    const validIds = assignments.map((a) => a.property_id);
    if (activePropertyId && validIds.includes(activePropertyId)) return;

    // Pick default assignment or first
    const defaultAssignment = assignments.find((a) => a.is_default) ?? assignments[0];
    setActivePropertyId(defaultAssignment.property_id);
    try {
      localStorage.setItem(STORAGE_KEY, defaultAssignment.property_id);
    } catch {}
  }, [assignments, activePropertyId]);

  const switchProperty = useCallback((propertyId: string) => {
    setActivePropertyId(propertyId);
    try {
      localStorage.setItem(STORAGE_KEY, propertyId);
    } catch {}
  }, []);

  const activeProperty = useMemo(
    () => properties.find((p) => p.id === activePropertyId) ?? null,
    [properties, activePropertyId]
  );

  const operationalMode = activeProperty?.operational_mode ?? null;

  // For guest users, provide a null-safe context (guests don't need property context)
  const value = useMemo<PropertyContextValue>(
    () => ({
      activeProperty,
      properties,
      switchProperty,
      isUmbrella,
      operationalMode,
      activePropertyId,
      isLoading: role === "guest" ? false : isLoading,
    }),
    [activeProperty, properties, switchProperty, isUmbrella, operationalMode, activePropertyId, isLoading, role]
  );

  return (
    <PropertyContext.Provider value={value}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
