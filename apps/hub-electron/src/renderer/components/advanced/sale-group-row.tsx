import { useState } from "react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { hubApi, type Bootstrap } from "../../hub-api.js";

export function SaleGroupRow({
  group,
  setNotice,
  onSaved,
}: {
  group: Bootstrap["saleGroups"][number];
  setNotice: NoticeSetter;
  onSaved: () => Promise<unknown>;
}) {
  const [ticketLabel, setTicketLabel] = useState<"KOT" | "BOT">(
    group.ticket_label,
  );
  const [savedTicketLabel, setSavedTicketLabel] = useState(group.ticket_label);
  const [taxText, setTaxText] = useState(() => {
    try {
      return (
        JSON.parse(group.tax_components_json) as Array<{
          name: string;
          rateBps: number;
        }>
      )
        .map((component) => `${component.name}:${component.rateBps / 100}`)
        .join(", ");
    } catch {
      return "";
    }
  });
  const [savedTaxText, setSavedTaxText] = useState(taxText);
  const [saving, setSaving] = useState(false);
  const dirty = ticketLabel !== savedTicketLabel || taxText.trim() !== savedTaxText.trim();

  function parseTaxComponents() {
    return taxText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, percent] = part.split(":").map((value) => value.trim());
        return {
          name: name ?? "",
          rateBps: Math.round(Number(percent || 0) * 100),
        };
      })
      .filter(
        (component) => component.name && Number.isFinite(component.rateBps),
      );
  }

  return (
    <article className="record-row sale-group-row">
      <div className="record-row-main">
        <strong>{group.name}</strong>
        {group.kind.toLowerCase() !== group.name.toLowerCase() ? <span>{group.kind}</span> : null}
      </div>
      <form
        className="sale-group-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          hubApi
            .updateSaleGroup(group.id, {
              ticketLabel,
              taxComponents: parseTaxComponents(),
            })
            .then(onSaved)
            .then(() => {
              setSavedTicketLabel(ticketLabel);
              setSavedTaxText(taxText);
              setNotice({ tone: "good", text: "Tax group saved." });
            })
            .catch((error) =>
              setNotice({ tone: "bad", text: messageOf(error) }),
            )
            .finally(() => setSaving(false));
        }}
      >
        <label>
          <span className="sr-only">Ticket for {group.name}</span>
          <select
            value={ticketLabel}
            onChange={(event) =>
              setTicketLabel(event.target.value as "KOT" | "BOT")
            }
          >
            <option value="KOT">KOT</option>
            <option value="BOT">BOT</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Taxes for {group.name}</span>
          <input
            value={taxText}
            onChange={(event) => setTaxText(event.target.value)}
            placeholder="CGST:2.5, SGST:2.5"
          />
        </label>
        <button type="submit" className={dirty ? "" : "secondary-button"} disabled={saving || !dirty}>
          {saving ? "Saving..." : dirty ? "Save" : "Saved"}
        </button>
      </form>
    </article>
  );
}
