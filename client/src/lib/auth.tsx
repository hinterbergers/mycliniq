import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Employee } from '@shared/schema';

interface AuthContextType {
  employee: Omit<Employee, 'passwordHash'> | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_ROLES = ['Primararzt', '1. Oberarzt', 'Sekretariat'];
const TOKEN_KEY = 'cliniq_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Omit<Employee, 'passwordHash'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!employee && !!token;
  const isAdmin = employee ? (employee.isAdmin || ADMIN_ROLES.includes(employee.role)) : false;

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      verifyToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (authToken: string) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmployee(data.employee);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setEmployee(null);
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setEmployee(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe?: boolean) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, rememberMe })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Anmeldung fehlgeschlagen');
    }

    const data = await response.json();
    setToken(data.token);
    setEmployee(data.employee);
    localStorage.setItem(TOKEN_KEY, data.token);
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setEmployee(null);
  };

  const refreshAuth = async () => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      await verifyToken(savedToken);
    }
  };

  return (
    <AuthContext.Provider value={{
      employee,
      token,
      isLoading,
      isAuthenticated,
      isAdmin,
      login,
      logout,
      refreshAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
