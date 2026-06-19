import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';

// How to (de)serialize a value to/from its localStorage string. `parse` may throw
// to signal a corrupt/invalid stored value, in which case the default is used.
export interface PersistCodec<T> {
  parse: (raw: string) => T;
  serialize: (value: T) => string;
}

// useState that mirrors itself to localStorage under `key`. Replaces the
// ubiquitous useState(() => read) + useEffect(() => write) pair. Defaults to
// JSON; pass a `codec` for non-JSON shapes (plain strings, Sets, validated
// numbers). A bad/missing stored value falls back to `initial`.
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  codec?: PersistCodec<T>
): [T, Dispatch<SetStateAction<T>>] {
  // Keep the latest codec without making it an effect dependency (callers pass a
  // fresh object literal each render, which would otherwise rewrite every render).
  const codecRef = useRef(codec);
  codecRef.current = codec;

  const [state, setState] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        return codecRef.current ? codecRef.current.parse(raw) : (JSON.parse(raw) as T);
      } catch {
        /* corrupt value — fall back to the default */
      }
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    const serialize = codecRef.current?.serialize ?? ((v: T) => JSON.stringify(v));
    localStorage.setItem(key, serialize(state));
  }, [key, state]);

  return [state, setState];
}

// Codec for a Set<string> stored as a JSON array.
export const setCodec: PersistCodec<Set<string>> = {
  parse: (raw) => new Set<string>(JSON.parse(raw)),
  serialize: (s) => JSON.stringify([...s]),
};

// Codec for a bare string stored verbatim (no JSON quoting).
export const stringCodec: PersistCodec<string> = {
  parse: (raw) => raw,
  serialize: (v) => v,
};
