import { createContext, useState, ReactNode } from "react";
import { verifyAppLogin } from "../lib/auth";

export interface AdminAuthContextType {
  isAdminAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | null>(
  null,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem("admin_auth") === "true";
  });

  const login = async (email: string, password: string): Promise<boolean> => {
    const role = await verifyAppLogin(email, password);
    if (role === "admin") {
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
