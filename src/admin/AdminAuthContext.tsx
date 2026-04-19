import { createContext, useState, ReactNode } from "react";

export interface AdminAuthContextType {
  isAdminAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | null>(
  null,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem("admin_auth") === "true";
  });

  const login = (username: string, password: string): boolean => {
    if (username === "admin" && password === "12345") {
      setIsAdminAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  };

  return (
    <AdminAuthContext.Provider value={{ isAdminAuthenticated, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
