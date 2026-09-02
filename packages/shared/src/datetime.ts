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
