import { useRef } from "react";

import { createOperationKey, stableStringify } from "../lib/mobile-format";

export function useOperationKeys() {
  const operationKeysRef = useRef<Record<string, string>>({});

  function operationKey(prefix: string, scope: unknown) {
    const mapKey = `${prefix}:${stableStringify(scope)}`;
    operationKeysRef.current[mapKey] ??= createOperationKey(prefix);
    return operationKeysRef.current[mapKey];
  }

  function clearOperationKey(prefix: string, scope: unknown) {
    delete operationKeysRef.current[`${prefix}:${stableStringify(scope)}`];
  }

  return { operationKey, clearOperationKey };
}
