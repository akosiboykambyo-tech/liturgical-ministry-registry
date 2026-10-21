"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, loading: true,
  signIn: async () => ({ error: "not_initialized" }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch("/api/admin/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });
      const result: {
        error?: string; access_token?: string; refresh_token?: string;
      } = await response.json();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
          const minutes = Math.ceil(retryAfter / 60);
          const wait = retryAfter < 60 ? `${Math.ceil(retryAfter)} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
          return { error: `${result.error ?? "Sign-in temporarily paused."} Try again in about ${wait}.` };
        }
        return { error: result.error ?? "Unable to sign in." };
      }
      if (!result.access_token || !result.refresh_token) {
        return { error: "Unable to establish an authentication session." };
      }
      const { error } = await supabase.auth.setSession({
        access_token: result.access_token, refresh_token: result.refresh_token,
      });
      if (error) return { error: "Unable to establish an authentication session." };
      return { error: null };
    } catch {
      return { error: "Unable to connect to the authentication server. Please try again." };
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); };
  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
