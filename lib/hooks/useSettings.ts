"use client";
import { useState, useEffect } from "react";
import { getSetting, setSetting } from "@/lib/db";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  serialize: (v: T) => string = JSON.stringify,
  deserialize: (s: string) => T = JSON.parse
): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting(key).then(stored => {
      if (stored !== null) {
        try { setValue(deserialize(stored)); } catch { /**/ }
      }
      setLoaded(true);
    });
  }, [key]);

  function set(v: T) {
    setValue(v);
    setSetting(key, serialize(v));
  }

  return [value, set, loaded];
}
