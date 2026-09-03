"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  status: "ACTIVE" | "BLOCKED";
  permissions: Record<string, boolean>;
  avatarUrl: string | null;
  theme: string;
};

type CurrentUserResource = ReturnType<typeof useApiResource<CurrentUser>>;
const CurrentUserContext = createContext<CurrentUserResource | null>(null);
const storageKey = "click-hubnet-current-user";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const resource = useApiResource<CurrentUser>("/api/auth/me");
  const [cachedUser, setCachedUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(storageKey);
      if (cached) setCachedUser(JSON.parse(cached) as CurrentUser);
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    if (!resource.data) return;
    setCachedUser(resource.data);
    sessionStorage.setItem(storageKey, JSON.stringify(resource.data));
  }, [resource.data]);

  return (
    <CurrentUserContext.Provider value={{ ...resource, data: resource.data ?? cachedUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function clearCurrentUserCache() {
  sessionStorage.removeItem(storageKey);
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error("useCurrentUser deve ser utilizado dentro de CurrentUserProvider.");
  return context;
}
