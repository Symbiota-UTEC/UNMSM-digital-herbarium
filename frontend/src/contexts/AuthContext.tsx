import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

export enum Role {
  Admin = "admin",
  InstitutionAdmin = "institution_admin",
  User = "user",
}

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  institutionId?: string | null;
  institution?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;               // 👈 solo esto
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // recuperar sesión
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken) setToken(savedToken);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("No se pudo parsear el user del storage", e);
      }
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
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

    // guardar token
    localStorage.setItem("token", data.access_token);
    setToken(data.access_token);

    const u = data.user;
    const mappedUser: User = {
      id: u.id,
      name: u.name ?? u.username ?? u.email ?? "Usuario",
      username: u.username,
      email: u.email,
      role: u.is_admin
          ? Role.Admin
          : u.is_institution_admin
              ? Role.InstitutionAdmin
              : Role.User,
      institution: u.institution ?? null,
      institutionId: u.institution_id ?? null,
    };

    setUser(mappedUser);
    localStorage.setItem("user", JSON.stringify(mappedUser));
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
      <AuthContext.Provider
          value={{
            user,
            token,
            login,
            logout,
            isAuthenticated: !!user,
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
