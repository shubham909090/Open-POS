export type RealtimeEvent = { type?: unknown };
export type QueryKey = readonly unknown[];

export function getRealtimeInvalidationKeys(event: RealtimeEvent): QueryKey[] {
  const type = String(event.type ?? "");
  if (type === "order.submitted" || type === "order.cancelled" || type === "order_items.cancelled" || type === "order_state.updated") {
    return [["bootstrap"], ["tableOrder"], ["kds"], ["currentBusinessDaySummary"], ["alcohol"]];
  }
  if (type === "bill.settled" || type === "bill.nc_marked") {
    return [["bootstrap"], ["tableOrder"], ["currentBusinessDaySummary"], ["dailyReports"], ["alcohol"], ["alcoholStockMovements"]];
  }
  if (type === "bill.generated" || type === "bill.printed" || type === "bill.reprinted" || type === "bill.history_reprinted" || type === "bill.revised") {
    return [["bootstrap"], ["tableOrder"], ["currentBusinessDaySummary"]];
  }
  if (type === "table.shifted" || type === "order_items.shifted") return [["bootstrap"], ["tableOrder"], ["kds"]];
  if (type === "kot.status_changed" || type === "kot.reprinted") return [["kds"], ["bootstrap"]];
  if (type.startsWith("alcohol_") || type === "alcohol_stock.adjusted") return [["alcohol"], ["alcoholStockMovements"], ["bootstrap"]];
  if (type.includes("menu_item") || type.includes("sale_group") || type.includes("production_unit") || type.startsWith("table.") || type.startsWith("floor.")) {
    return [["bootstrap"], ["alcohol"]];
  }
  if (type.includes("printer") || type.includes("print_layout") || type.includes("ticket_template")) return [["bootstrap"], ["print-layouts"], ["receipt-printer"]];
  return [["bootstrap"]];
}

export function connectHubRealtime(input: {
  token: string;
  onEvent: (event: RealtimeEvent) => void;
  onDisconnect?: () => void;
}): () => void {
  if (!input.token || typeof WebSocket === "undefined") return () => {};
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;

  const open = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/realtime?token=${encodeURIComponent(input.token)}`;
    socket = new WebSocket(url);
    socket.onmessage = (message) => {
      try {
        input.onEvent(JSON.parse(String(message.data)) as RealtimeEvent);
      } catch {
        // Ignore malformed realtime messages; next event or poll refresh catches truth.
      }
    };
    socket.onclose = () => {
      input.onDisconnect?.();
      if (!closed) retry = setTimeout(open, 1500);
    };
    socket.onerror = () => socket?.close();
  };

  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
