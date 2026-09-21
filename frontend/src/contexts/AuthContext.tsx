import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";

import { User, AuthContextType, mapApiUserToUser } from "@interfaces/auth";
import { Role } from "@constants/roles";
import { authService } from "@services/auth.service";
import { createApiFetch } from "@services/http";
import { STORAGE_KEYS } from "@constants/storageKeys";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- helpers: decodificar JWT sin libs ---
function decodeJwtPayload(token: string): any | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Timer de auto-logout. Ref, no estado: así las funciones de abajo mantienen identidad estable.
  const logoutTimer = useRef<number | null>(null);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimer.current) {
      window.clearTimeout(logoutTimer.current);
      logoutTimer.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearLogoutTimer();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);

    window.dispatchEvent(new CustomEvent("auth:logged-out"));
  }, [clearLogoutTimer]);

  const scheduleAutoLogout = useCallback(
    (jwt: string) => {
      clearLogoutTimer();
      const payload = decodeJwtPayload(jwt);
      if (!payload?.exp) return;

      const msUntilExp = payload.exp * 1000 - Date.now();
      if (msUntilExp <= 0) {
        // ya expirado
        logout();
        return;
      }
      // pequeño margen de 1s
      logoutTimer.current = window.setTimeout(logout, msUntilExp + 1000);
    },
    [clearLogoutTimer, logout],
  );

  // recuperar sesión
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken) {
      setToken(savedToken);
      // si el token está expirado, salir al toque
      const payload = decodeJwtPayload(savedToken);
      if (payload?.exp && payload.exp * 1000 <= Date.now()) {
        logout();
      } else {
        scheduleAutoLogout(savedToken);
      }
    }
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("No se pudo parsear el user del storage", e);
      }
    }
    return () => clearLogoutTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authService.login(email, password);

      localStorage.setItem(STORAGE_KEYS.TOKEN, data.access_token);
      setToken(data.access_token);
      scheduleAutoLogout(data.access_token);

      const mappedUser: User = mapApiUserToUser(data.user);
      setUser(mappedUser);
      localStorage.setItem("user", JSON.stringify(mappedUser));

      window.dispatchEvent(new CustomEvent("auth:logged-in"));
    },
    [scheduleAutoLogout],
  );

  const apiFetch = useMemo(() => createApiFetch({ getToken: () => token, onUnauthorized: logout }), [token, logout]);

  const value = useMemo(
    () => ({ user, token, login, logout, isAuthenticated: !!user, apiFetch }),
    [user, token, login, logout, apiFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
};
