import { useRef } from "react";

export function useOperationKeys() {
  const keysRef = useRef<Record<string, string>>({});
  const keyFor = (prefix: string, scope: unknown) => {
    const mapKey = `${prefix}:${JSON.stringify(scope)}`;
    keysRef.current[mapKey] ??= `${prefix}-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    return keysRef.current[mapKey];
  };
  const clear = (prefix: string, scope: unknown) => {
    delete keysRef.current[`${prefix}:${JSON.stringify(scope)}`];
  };
  return { keyFor, clear };
}
