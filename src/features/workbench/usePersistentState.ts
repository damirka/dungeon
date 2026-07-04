import { useEffect, useState } from "react";

export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T
) {
  const [value, setValue] = useState<T>(() => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw);
      return validate(parsed) ? parsed : fallback;
    } catch {
      return validate(raw) ? raw : fallback;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
