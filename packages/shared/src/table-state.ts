import type { TableDisplayState, TableStatus } from "./types.js";

export interface TableStateInput {
  active?: boolean | number | null;
  status?: TableStatus | string | null;
}

export function getTableDisplayState(table: TableStateInput): TableDisplayState {
  if (table.active === false || table.active === 0) return "disabled";
  if (table.status === "occupied") return "running";
  if (table.status === "billed") return "bill_printed";
  if (table.status === "attention") return "needs_attention";
  return "free";
}

export function tableDisplayLabel(state: TableDisplayState): string {
  switch (state) {
    case "running":
      return "Running";
    case "bill_printed":
      return "Bill printed";
    case "needs_attention":
      return "Needs attention";
    case "disabled":
      return "Disabled";
    case "free":
    default:
      return "Free";
  }
}

export function tableDisplayClass(state: TableDisplayState): string {
  return state.replace("_", "-");
}

export function isTransferTargetTable(table: TableStateInput): boolean {
  const state = getTableDisplayState(table);
  return state === "free" || state === "running";
}
