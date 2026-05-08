import { useState, useEffect } from "react";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  blocked: boolean;
}

let globalState: AuthState = { user: null, loading: true, authenticated: false, blocked: false };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export async function checkAuth(): Promise<AuthState> {
  try {
    const res = await fetch("/api/auth/me");

    if (res.status === 403) {
      // Conta bloqueada — sessão encerrada pelo servidor
      globalState = { user: null, loading: false, authenticated: false, blocked: true };
      notify();
      return globalState;
    }

    const data = await res.json();
    globalState = {
      user: data.authenticated ? data.user : null,
      loading: false,
      authenticated: !!data.authenticated,
      blocked: false,
    };
  } catch {
    globalState = { user: null, loading: false, authenticated: false, blocked: false };
  }
  notify();
  return globalState;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  globalState = { user: null, loading: false, authenticated: false, blocked: false };
  notify();
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(globalState);

  useEffect(() => {
    const update = () => setState({ ...globalState });
    listeners.add(update);

    if (globalState.loading) {
      checkAuth();
    }

    return () => { listeners.delete(update); };
  }, []);

  return state;
}
