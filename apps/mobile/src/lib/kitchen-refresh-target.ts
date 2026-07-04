import type { HubBootstrap } from "./hub-client";

export function getKitchenRefreshTarget(bootstrap: HubBootstrap, kitchenUnitId: string): {
  kdsEnabled: boolean;
  kitchenUnits: HubBootstrap["productionUnits"];
  nextUnitId: string;
} {
  const kdsEnabled = bootstrap.setup?.kdsEnabled ?? true;
  const kitchenUnits = kdsEnabled
    ? bootstrap.productionUnits.filter((unit) => unit.active !== false && unit.active !== 0 && unit.kds_enabled !== false && unit.kds_enabled !== 0)
    : [];
  const nextUnitId = kitchenUnits.some((unit) => unit.id === kitchenUnitId) ? kitchenUnitId : kitchenUnits[0]?.id ?? "";
  return { kdsEnabled, kitchenUnits, nextUnitId };
}
