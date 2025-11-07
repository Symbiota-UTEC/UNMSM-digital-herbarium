import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";


import { User, AuthContextType, mapApiUserToUser } from "@interfaces/auth";
import { Role } from "@constants/roles";
import { API } from "@constants/api"
import { STORAGE_KEYS } from "@constants/storageKeys"


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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  console.log(user);
  const [token, setToken] = useState<string | null>(null);

  // limpiar cualquier timer de auto-logout
  const [logoutTimer, setLogoutTimer] = useState<number | null>(null);

  const clearLogoutTimer = () => {
    if (logoutTimer) {
      window.clearTimeout(logoutTimer);
      setLogoutTimer(null);
    }
  };

  const scheduleAutoLogout = (jwt: string) => {
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
    const id = window.setTimeout(() => {
      logout();
    }, msUntilExp + 1000);
    setLogoutTimer(id);
  };

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

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API.BASE_URL}${API.PATHS.LOGIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("Respuesta no OK:", txt);
      throw new Error("Credenciales incorrectas");
    }

    const data = await response.json();

    if (!data.access_token || !data.user) {
      throw new Error("Respuesta del servidor inválida");
    }

    localStorage.setItem(STORAGE_KEYS.TOKEN, data.access_token);
    setToken(data.access_token);
    scheduleAutoLogout(data.access_token);

    const u = data.user;
    const mappedUser: User = mapApiUserToUser(u);

    setUser(mappedUser);
    localStorage.setItem("user", JSON.stringify(mappedUser));

    window.dispatchEvent(new CustomEvent("auth:logged-in"));
  };

  const logout = () => {
    clearLogoutTimer();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);

    window.dispatchEvent(new CustomEvent("auth:logged-out"));
  };

  const apiFetch: AuthContextType["apiFetch"] = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error("No autorizado");
    }
    return res;
  };

  return (
      <AuthContext.Provider
          value={{
            user,
            token,
            login,
            logout,
            isAuthenticated: !!user,
            apiFetch,
          }}
      >
        {children}
      </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
};
