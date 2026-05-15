import { formatInr } from "@gaurav-pos/shared";
import { Plus } from "lucide-react";
import type { MenuItem } from "../../hub-api.js";
import { EmptyState } from "../ui/empty-state.js";

export function MenuResultSection({
  title,
  items,
  selectedTableId,
  onAdd,
  emptyText
}: {
  title: string;
  items: MenuItem[];
  selectedTableId: string;
  onAdd: (tableId: string, item: MenuItem, variantId?: string) => void;
  emptyText?: string;
}) {
  return (
    <div className="menu-result-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="menu-grid">
          {items.map((item) => (
            <MenuCard key={item.id} item={item} onAdd={(variantId) => onAdd(selectedTableId, item, variantId)} />
          ))}
        </div>
      ) : emptyText ? (
        <EmptyState title="No dishes found" description={emptyText} />
      ) : null}
    </div>
  );
}

export function MenuCard({ item, onAdd }: { item: MenuItem; onAdd: (variantId?: string) => void }) {
  const activeVariants = (item.variants ?? []).filter((variant) => Boolean(variant.active));
  const variants = activeVariants.length || item.sale_group_kind === "alcohol" ? activeVariants : [{ id: "", label: "Regular", kind: "default", price_paise: item.price_paise, volume_ml: null, inventory_action: "none", sort_order: 0, active: true }];
  return (
    <article className="menu-card">
      <div>
        <strong>{item.name}</strong>
        <span>{item.production_unit_name ?? "No kitchen assigned"}</span>
      </div>
      <footer>
        {variants.length === 0 ? (
          <>
            <b>Unavailable</b>
            <button type="button" className="add-item-button" disabled aria-label={`${item.name} unavailable`}>
              <Plus size={18} />
            </button>
          </>
        ) : variants.length === 1 ? (
          <>
            <b>{formatInr(variants[0]?.price_paise ?? item.price_paise)}</b>
            <button type="button" className="add-item-button" onClick={() => onAdd(variants[0]?.id || undefined)} aria-label={`Add ${item.name}`}>
              <Plus size={18} />
            </button>
          </>
        ) : (
          <div className="variant-buttons">
            {variants.map((variant) => (
              <button key={variant.id} type="button" onClick={() => onAdd(variant.id)}>
                <span>{variant.label}</span>
                <b>{formatInr(variant.price_paise)}</b>
              </button>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
