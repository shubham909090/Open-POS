import type { DraftOrder } from "./draft-store";
import type { HubClient, HubOrder } from "./hub-client";

export function orderMatchesTable(order: HubOrder | null, tableId: string | null): order is HubOrder {
  return Boolean(tableId && order?.order.table_id === tableId);
}

/** A selection has an identity even when the user goes A → B → A. */
export function createTableSelection(client: object) {
  let selected = { client, tableId: null as string | null, epoch: 0 };
  let orderRequest = 0;
  return {
    snapshot() { return selected; },
    select(tableId: string | null) {
      selected = { ...selected, tableId, epoch: selected.epoch + 1 };
      orderRequest += 1;
      return selected;
    },
    setClient(nextClient: object) {
      if (selected.client === nextClient) return;
      selected = { client: nextClient, tableId: null, epoch: selected.epoch + 1 };
      orderRequest += 1;
    },
    matches(candidateClient: object, tableId: string | null) {
      return selected.client === candidateClient && selected.tableId === tableId && tableId !== null;
    },
    isCurrent(selection: typeof selected) {
      return selected === selection;
    },
    startOrder(candidateClient: object, tableId: string) {
      if (selected.client !== candidateClient || selected.tableId !== tableId) return null;
      return { selection: selected, request: ++orderRequest };
    },
    isCurrentOrder(token: { selection: typeof selected; request: number }) {
      return selected === token.selection && orderRequest === token.request;
    },
  };
}

type TableSelection = ReturnType<typeof createTableSelection>;
type Selection = ReturnType<TableSelection["select"]>;

export async function restoreSelectedDraft(
  scope: TableSelection,
  selection: Selection,
  load: (tableId: string) => Promise<DraftOrder | null>,
  apply: (draft: DraftOrder | null) => void,
) {
  if (!selection.tableId) return false;
  const draft = await load(selection.tableId);
  if (!scope.isCurrent(selection)) return false;
  apply(draft);
  return true;
}

export async function loadSelectedTableOrder(
  scope: TableSelection,
  client: Pick<HubClient, "tableOrder">,
  tableId: string,
  apply: (order: HubOrder | null) => void,
  onError: (message: string) => void,
) {
  const token = scope.startOrder(client, tableId);
  if (!token) return;
  try {
    const order = await client.tableOrder(tableId);
    if (!scope.isCurrentOrder(token)) return;
    if (order && !orderMatchesTable(order, tableId)) {
      apply(null);
      onError("This order belongs to another table. Select the table again to reload it.");
      return;
    }
    apply(order);
  } catch (error) {
    if (!scope.isCurrentOrder(token)) return;
    apply(null);
    onError(error instanceof Error ? error.message : "Could not load table order.");
  }
}
