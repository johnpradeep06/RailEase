import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  clearExpired: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    phone?: string,
  ) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onExpired() {
      setUser(null);
      setSessionExpired(true);
    }
    window.addEventListener("railease:session-expired", onExpired);
    return () => window.removeEventListener("railease:session-expired", onExpired);
  }, []);

  async function login(email: string, password: string) {
    const { access_token } = await api.login(email, password);
    setToken(access_token);
    setSessionExpired(false);
    setUser(await api.me());
  }

  async function register(
    name: string,
    email: string,
    password: string,
    phone?: string,
  ) {
    await api.register({ name, email, password, phone: phone || null });
    await login(email, password);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        sessionExpired,
        clearExpired: () => setSessionExpired(false),
        login,
        register,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
