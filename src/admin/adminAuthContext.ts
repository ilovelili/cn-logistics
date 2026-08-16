import { createContext } from "react";

export interface AdminAuthContextType {
  isAdminAuthenticated: boolean;
  setAuthenticated: (authenticated: boolean) => void;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | null>(
  null,
);
