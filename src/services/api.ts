import { useEffect, useState } from "react";

export interface ApiStatusPayload {
  ok: boolean;
  root?: string;
  files?: Record<string, string>;
}

export type ApiStatus =
  | { state: "checking"; label: string }
  | { state: "online"; label: string; root: string; files: Record<string, string> }
  | { state: "offline"; label: string };

export type ResourceState<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "failed"; message: string };

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>({ state: "checking", label: "Checking API" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchJson<ApiStatusPayload>("/api/status")
      .then((payload) => {
        if (!cancelled && payload.ok) {
          setStatus({
            state: "online",
            label: "Mapper API",
            root: payload.root || "",
            files: payload.files || {}
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ state: "offline", label: "API offline" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { status, refresh: () => setTick((value) => value + 1) };
}

export function useJsonResource<T>(url: string) {
  const [resource, setResource] = useState<ResourceState<T>>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchJson<T>(url)
      .then((data) => {
        if (!cancelled) {
          setResource({ state: "ready", data });
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setResource({ state: "failed", message: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resource;
}
