import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { emitStaffLogin, emitStaffLoginFailed, emitAfterHoursAccess } from "@/lib/fenrir/events";
import type { AppRole } from "@/lib/permissions";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** The user's highest-authority role, or null if none assigned */
  role: AppRole | null;
  /** True when role lookup has completed for current session */
  roleResolved: boolean;
  /** Convenience: true if role is "admin" */
  isAdmin: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const ROLE_PRIORITY: Record<AppRole, number> = {
  guest: 0,
  viewer: 1,
  maintenance: 2,
  front_desk: 3,
  front_desk_supervisor: 4,
  manager: 5,
  admin: 6,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);

  const fetchRole = useCallback(async (userId: string) => {
    // Retry role lookup a few times for slower mobile/PWA session restore
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!error) {
        if (data && data.length > 0) {
          // Pick the highest-authority role
          const best = data.reduce((acc, cur) =>
            ROLE_PRIORITY[cur.role as AppRole] > ROLE_PRIORITY[acc.role as AppRole] ? cur : acc
          );
          setRole(best.role as AppRole);
        } else {
          setRole(null);
        }
        setRoleResolved(true);
        return;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }

    // Final fallback on persistent failure
    setRole(null);
    setRoleResolved(true);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "TOKEN_REFRESHED" && !session) {
          // Refresh failed — force sign out to clear stale state
          await supabase.auth.signOut();
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRole(session.user.id), 0);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      emitStaffLoginFailed(email);
    } else if (data.user) {
      // Emit login event after role is resolved (deferred)
      const userId = data.user.id;
      const userEmail = data.user.email;
      setTimeout(() => {
        emitStaffLogin({ userId, email: userEmail, role }, "password");
        emitAfterHoursAccess({ userId, email: userEmail, role }, "login");
      }, 500);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, loading, role, isAdmin, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
