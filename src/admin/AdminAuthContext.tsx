import { createContext, ReactNode, useCallback, useState } from "react";

export interface AdminAuthContextType {
  isAdminAuthenticated: boolean;
  setAuthenticated: (authenticated: boolean) => void;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | null>(
  null,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem("admin_auth") === "true";
  });

  const setAuthenticated = useCallback((authenticated: boolean) => {
    setIsAdminAuthenticated(authenticated);
    if (authenticated) {
      sessionStorage.setItem("admin_auth", "true");
    } else {
      sessionStorage.removeItem("admin_auth");
    }
  }, []);

  const logout = useCallback(() => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ isAdminAuthenticated, setAuthenticated, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}
