import React, { createContext, useContext, useState, useEffect } from 'react';

enum Role {
  Admin = 'admin',
  InstitutionAdmin = 'institution_admin',
  User = 'user',
}

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  institutionId?: string;
  institution?: string;
}


interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    console.log('[Auth] user actualizado:', user);
  }, [user]);

    const login = async (email: string, password: string) => {
      try {
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

      if (!response.ok) {
        const txt = await response.text();
        console.error('Respuesta no OK:', txt);
        throw new Error('Credenciales incorrectas');
      }

      const data = await response.json();
      console.log('Datos crudos del backend:', JSON.stringify(data, null, 2));

      if (!data.access_token || !data.user) {
        throw new Error('Respuesta del servidor inválida');
      }

      localStorage.setItem('token', data.access_token);

      const u = data.user;

      const mappedUser: User = {
        id: u.id,
        name: u.name,
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
      console.log('[Auth] setUser con:', mappedUser);

      return mappedUser;
    } catch (error) {
      console.error('Error de login:', error);
      throw new Error('Error al iniciar sesión');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
