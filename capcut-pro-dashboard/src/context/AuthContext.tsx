"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { PermissionKey } from "@/lib/auth-shared";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "developer" | "admin" | "superadmin";
  status: string;
  permissions: Record<string, boolean> | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isDeveloper: boolean;
  isSuperAdmin: boolean;
  hasPermission: (key: PermissionKey) => boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isDeveloper: false,
  isSuperAdmin: false,
  hasPermission: () => false,
  logout: async () => {},
  refetch: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const json = await res.json();
        setUser(json.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  };

  const hasPermission = (key: PermissionKey): boolean => {
    if (!user) return false;
    if (user.role === "developer" || user.role === "superadmin") return true;
    if (user.permissions?.[key] === true) return true;
    // Existing admins that were explicitly granted Affiliate access keep access
    // while the permission name transitions to Member. No database rewrite needed.
    if (key === "page_members" && user.permissions?.page_affiliates === true) return true;
    return false;
  };

  const isDeveloper = user?.role === "developer";
  const isSuperAdmin = user?.role === "superadmin" || isDeveloper;

  return (
    <AuthContext.Provider value={{ user, loading, isDeveloper, isSuperAdmin, hasPermission, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
