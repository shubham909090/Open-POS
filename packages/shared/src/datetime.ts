export function formatPosDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const time = date
    .toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace("AM", "am")
    .replace("PM", "pm");
  return `${day}/${month}/${year} at ${time}`;
}

export function formatItemPunch(item?: {
  kot_sequence?: number | null;
  kot_created_at?: string | null;
  kot_ticket_label?: "KOT" | "BOT" | null;
  kot_type?: string | null;
}): string | undefined {
  if (!item?.kot_sequence || !item.kot_created_at) return undefined;
  return `${item.kot_ticket_label ?? "KOT"} #${item.kot_sequence}${item.kot_type === "table_shifted" ? " (transfer)" : ""} · ${formatPosDateTime(item.kot_created_at)}`;
}
