import { formatCompactInr } from "@gaurav-pos/shared";
import { Beer, Coffee, Package, Utensils, Wine } from "lucide-react";
import type { MenuItem } from "../../hub-api.js";
import { EmptyState } from "../ui/empty-state.js";
import type { PointerEvent } from "react";

type MenuActionVariant = {
  id?: string;
  label: string;
  kind?: string;
  price_paise: number;
  active?: boolean | number;
};

export function MenuResultSection({
  title,
  items,
  selectedTableId,
  onAdd,
  activeItemId,
  onItemPointerMove,
  setItemElement,
  emptyText,
  mixed = false,
  draftCounts
}: {
  title: string;
  mixed?: boolean;
  /** Quantity of each menu item already in the unsent draft, keyed by menu item id. */
  draftCounts?: Map<string, number>;
  items: MenuItem[];
  selectedTableId: string;
  onAdd: (tableId: string, item: MenuItem, variantId?: string) => void;
  activeItemId?: string;
  onItemPointerMove?: (index: number, event: PointerEvent<HTMLElement>) => void;
  setItemElement?: (index: number, element: HTMLElement | null) => void;
  emptyText?: string;
}) {
  return (
    <div className={`menu-result-section${mixed ? " mixed" : ""}`}>
      <h3 className="menu-result-title">{title}</h3>
      {items.length ? (
        <div className="menu-grid">
          {items.map((item, index) => (
            <MenuCard
              key={item.id}
              rowRef={(element) => setItemElement?.(index, element)}
              active={activeItemId === item.id}
              item={item}
              draftCount={draftCounts?.get(item.id) ?? 0}
              onActive={(event) => onItemPointerMove?.(index, event)}
              onAdd={(variantId) => onAdd(selectedTableId, item, variantId)}
            />
          ))}
        </div>
      ) : emptyText ? (
        <EmptyState title="No dishes found" description={emptyText} />
      ) : null}
    </div>
  );
}

export function MenuCard({
  item,
  draftCount = 0,
  active = false,
  onActive,
  rowRef,
  onAdd
}: {
  item: MenuItem;
  draftCount?: number;
  active?: boolean;
  onActive?: (event: PointerEvent<HTMLElement>) => void;
  rowRef?: (element: HTMLElement | null) => void;
  onAdd: (variantId?: string) => void;
}) {
  const countBadge = draftCount > 0 ? <span className="menu-tile-count" aria-label={`${draftCount} in new order`}>{draftCount}</span> : null;
  const variants = getMenuActionVariants(item);
  const single = variants.length === 1 ? variants[0] : null;
  const className = `menu-card menu-tile category-${item.sale_group_kind ?? "other"}${single ? " single" : " multi"}${draftCount > 0 ? " in-draft" : ""}${active ? " keyboard-active" : ""}`;
  // A plain dish is one big target: the whole tile adds it. Variant dishes keep one chip per size.
  if (single) {
    const price = formatCompactInr(single.price_paise);
    const actionLabel = single.kind === "default" ? price : `${single.label} · ${price}`;
    return (
      <article ref={rowRef} className={className} onPointerMove={onActive}>
        <button type="button" className="menu-tile-button" onClick={() => onAdd(single.id || undefined)} aria-label={`${item.name} + ${actionLabel}`}>
          <strong className="menu-tile-name" title={item.name}>{item.name}</strong>
          <span className="menu-tile-price">{actionLabel}</span>
        </button>
        {countBadge}
      </article>
    );
  }
  return (
    <article ref={rowRef} className={className} onPointerMove={onActive}>
      <strong className="menu-tile-name" title={item.name}>{item.name}</strong>
      <MenuItemActionGroup itemName={item.name} variants={variants} onAdd={onAdd} className="menu-tile-variants" />
      {countBadge}
    </article>
  );
}

export function getMenuActionVariants(item: MenuItem): MenuActionVariant[] {
  const activeVariants = (item.variants ?? []).filter((variant) => Boolean(variant.active));
  return activeVariants.length || item.sale_group_kind === "alcohol"
    ? activeVariants
    : [{ id: "", label: "", kind: "default", price_paise: item.price_paise, active: true }];
}

export function MenuItemActionGroup({
  itemName,
  variants,
  onAdd,
  className = ""
}: {
  itemName: string;
  variants: MenuActionVariant[];
  onAdd: (variantId?: string) => void;
  className?: string;
}) {
  if (!variants.length) {
    return (
      <div className={`variant-buttons menu-variant-buttons ${className}`.trim()}>
        <button type="button" disabled aria-label={`${itemName} unavailable`}>
          Unavailable
        </button>
      </div>
    );
  }
  return (
    <div className={`variant-buttons menu-variant-buttons ${className}`.trim()}>
      {variants.map((variant) => {
        const variantId = variant.id || undefined;
        const label = variant.kind === "default" ? `+ ${formatCompactInr(variant.price_paise)}` : `${variant.label} ${formatCompactInr(variant.price_paise)}`;
        return (
          <button key={variant.id || "default"} type="button" onClick={() => onAdd(variantId)} aria-label={`${itemName} ${label}`}>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CategoryBadge({ kind, className = "" }: { kind?: string; className?: string }) {
  const Icon = categoryIcon(kind);
  return (
    <div className={`menu-card-icon ${className}`.trim()} aria-hidden="true">
      <Icon size={18} />
    </div>
  );
}

export function categoryIcon(kind?: string) {
  if (kind === "food") return Utensils;
  if (kind === "alcohol") return Wine;
  if (kind === "beverage") return Coffee;
  if (kind === "other") return Package;
  return Beer;
}
