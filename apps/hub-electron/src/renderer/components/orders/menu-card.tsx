import { formatCompactInr } from "@gaurav-pos/shared";
import { Beer, Coffee, Package, Utensils, Wine } from "lucide-react";
import type { MenuItem } from "../../hub-api.js";
import { EmptyState } from "../ui/empty-state.js";

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
  onActiveItemIndexChange,
  emptyText
}: {
  title: string;
  items: MenuItem[];
  selectedTableId: string;
  onAdd: (tableId: string, item: MenuItem, variantId?: string) => void;
  activeItemId?: string;
  onActiveItemIndexChange?: (index: number) => void;
  emptyText?: string;
}) {
  return (
    <div className="menu-result-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="menu-grid">
          {items.map((item, index) => (
            <MenuCard
              key={item.id}
              active={activeItemId === item.id}
              item={item}
              onActive={() => onActiveItemIndexChange?.(index)}
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
  active = false,
  onActive,
  onAdd
}: {
  item: MenuItem;
  active?: boolean;
  onActive?: () => void;
  onAdd: (variantId?: string) => void;
}) {
  const variants = getMenuActionVariants(item);
  return (
    <article className={`menu-card compact-menu-card category-${item.sale_group_kind ?? "other"}${active ? " keyboard-active" : ""}`} onMouseEnter={onActive}>
      <CategoryBadge kind={item.sale_group_kind} />
      <div className="menu-card-main">
        <strong>{item.name}</strong>
        <span>{item.sale_group_name ?? item.production_unit_name ?? "Menu item"}</span>
      </div>
      <footer>
        <MenuItemActionGroup itemName={item.name} variants={variants} onAdd={onAdd} />
      </footer>
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
