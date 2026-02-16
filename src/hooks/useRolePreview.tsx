import { createContext, useContext, useState, ReactNode } from "react";
import type { AppRole } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

interface RolePreviewContextType {
  previewRole: AppRole | null;
  setPreviewRole: (role: AppRole | null) => void;
  effectiveRole: AppRole | null;
  isPreviewMode: boolean;
}

const RolePreviewContext = createContext<RolePreviewContextType | undefined>(undefined);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const { role: actualRole, isAdmin } = useAuth();
  const [previewRole, setPreviewRole] = useState<AppRole | null>(null);

  // Only admin can use preview mode
  const activePreview = isAdmin ? previewRole : null;
  const effectiveRole = activePreview ?? actualRole;

  return (
    <RolePreviewContext.Provider value={{
      previewRole: activePreview,
      setPreviewRole: isAdmin ? setPreviewRole : () => {},
      effectiveRole,
      isPreviewMode: !!activePreview,
    }}>
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (!context) throw new Error("useRolePreview must be used within RolePreviewProvider");
  return context;
}

/** Returns the effective role for UI rendering (preview or actual) */
export function useEffectiveRole(): AppRole | null {
  const context = useContext(RolePreviewContext);
  if (!context) {
    // Fallback if not wrapped — use actual role
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { role } = useAuth();
    return role;
  }
  return context.effectiveRole;
}
