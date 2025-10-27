import React, { createContext, useContext, useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    // Mock login - en producción esto se conectaría a un backend
    // Simular delay de red
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Usuario demo admin
    if (email === 'admin@botanica.com') {
      setUser({
        id: '1',
        name: 'Administrador',
        email: email,
        role: 'admin'
      });
    } else {
      // Usuario normal
      setUser({
        id: '2',
        name: 'Usuario Botánico',
        email: email,
        role: 'user'
      });
    }
  };

  const logout = () => {
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
