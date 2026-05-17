import Fuse from "fuse.js";
import type { SaleGroupKind } from "./types.js";

type ActiveFlag = boolean | number | null | undefined;

export interface SearchableMenuVariant {
  label?: string | null;
  active?: ActiveFlag;
}

export interface SearchableMenuItem {
  id: string;
  name: string;
  active?: ActiveFlag;
  saleGroupName?: string | null;
  sale_group_name?: string | null;
  saleGroupKind?: SaleGroupKind | string | null;
  sale_group_kind?: SaleGroupKind | string | null;
  productionUnitId?: string | null;
  production_unit_id?: string | null;
  productionUnitName?: string | null;
  production_unit_name?: string | null;
  variants?: SearchableMenuVariant[];
}

export interface MenuSearchFilters {
  saleGroupKind?: SaleGroupKind | "all";
  productionUnitId?: string | null;
  includeInactive?: boolean;
  limit?: number;
}

export interface MenuPopularityStat {
  menuItemId?: string;
  menu_item_id?: string;
  quantity: number;
}

export interface MenuQuickPick<T extends SearchableMenuItem> {
  section: "recent" | "popular";
  item: T;
  quantity?: number;
}

function isActive(value: ActiveFlag): boolean {
  return value === undefined || value === null || value === true || value === 1;
}

function saleGroupKind(item: SearchableMenuItem): string {
  return String(item.saleGroupKind ?? item.sale_group_kind ?? "");
}

function productionUnitId(item: SearchableMenuItem): string | null {
  return item.productionUnitId ?? item.production_unit_id ?? null;
}

function searchableVariants(item: SearchableMenuItem): SearchableMenuVariant[] {
  return (item.variants ?? []).filter((variant) => isActive(variant.active));
}

function matchesFilters<T extends SearchableMenuItem>(item: T, filters: MenuSearchFilters): boolean {
  if (!filters.includeInactive && !isActive(item.active)) return false;
  if (filters.saleGroupKind && filters.saleGroupKind !== "all" && saleGroupKind(item) !== filters.saleGroupKind) return false;
  if (filters.productionUnitId && productionUnitId(item) !== filters.productionUnitId) return false;
  return true;
}

type CachedMenuSearch<T extends SearchableMenuItem> = {
  fingerprint: string;
  filtered: T[];
  fuse?: Fuse<T>;
};

const searchCache = new WeakMap<readonly SearchableMenuItem[], Map<string, CachedMenuSearch<SearchableMenuItem>>>();

function itemCacheFingerprint(item: SearchableMenuItem): string {
  const variants = searchableVariants(item).map((variant) => `${variant.label ?? ""}:${variant.active ?? ""}`).join(",");
  return [
    item.id,
    item.name,
    item.active ?? "",
    saleGroupKind(item),
    productionUnitId(item) ?? "",
    item.sale_group_name ?? item.saleGroupName ?? "",
    item.production_unit_name ?? item.productionUnitName ?? "",
    variants
  ].join(":");
}

function menuCacheFingerprint(items: SearchableMenuItem[]): string {
  return `${items.length}|${items.map(itemCacheFingerprint).join("|")}`;
}

function filterCacheKey(filters: MenuSearchFilters): string {
  return [
    filters.includeInactive ? "all" : "active",
    filters.saleGroupKind ?? "",
    filters.productionUnitId ?? ""
  ].join("|");
}

function getCachedMenuSearch<T extends SearchableMenuItem>(items: T[], filters: MenuSearchFilters): CachedMenuSearch<T> {
  const key = filterCacheKey(filters);
  const fingerprint = menuCacheFingerprint(items);
  let byFilter = searchCache.get(items);
  if (!byFilter) {
    byFilter = new Map();
    searchCache.set(items, byFilter);
  }

  const cached = byFilter.get(key) as CachedMenuSearch<T> | undefined;
  if (cached?.fingerprint === fingerprint) return cached;

  const next: CachedMenuSearch<T> = {
    fingerprint,
    filtered: items.filter((item) => matchesFilters(item, filters))
  };
  byFilter.set(key, next as unknown as CachedMenuSearch<SearchableMenuItem>);
  return next;
}

function getFuse<T extends SearchableMenuItem>(cached: CachedMenuSearch<T>): Fuse<T> {
  cached.fuse ??= new Fuse(cached.filtered, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.42,
    keys: [
      { name: "name", weight: 0.58 },
      { name: "variants.label", weight: 0.18 },
      { name: "sale_group_name", weight: 0.1 },
      { name: "saleGroupName", weight: 0.1 },
      { name: "production_unit_name", weight: 0.08 },
      { name: "productionUnitName", weight: 0.08 },
      { name: "sale_group_kind", weight: 0.03 },
      { name: "saleGroupKind", weight: 0.03 }
    ],
    getFn: (item, path) => {
      const key = Array.isArray(path) ? path.join(".") : path;
      if (key === "variants.label") return searchableVariants(item as SearchableMenuItem).map((variant) => variant.label ?? "");
      return Fuse.config.getFn(item, path);
    }
  });
  return cached.fuse;
}

export function searchMenuItems<T extends SearchableMenuItem>(
  items: T[],
  query: string,
  filters: MenuSearchFilters = {}
): T[] {
  const cached = getCachedMenuSearch(items, filters);
  const trimmedQuery = query.trim();
  const limit = filters.limit;

  if (!trimmedQuery) return limit ? cached.filtered.slice(0, limit) : cached.filtered;

  const fuse = getFuse(cached);
  const results = fuse.search(trimmedQuery, limit ? { limit } : undefined).map((result) => result.item);
  return results;
}

export function rankMenuQuickPicks<T extends SearchableMenuItem>(
  items: T[],
  recentIds: string[],
  popularStats: MenuPopularityStat[],
  filters: MenuSearchFilters = {}
): Array<MenuQuickPick<T>> {
  const availableItems = items.filter((item) => matchesFilters(item, filters));
  const byId = new Map(availableItems.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const picks: Array<MenuQuickPick<T>> = [];

  for (const id of recentIds) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    if (!item) continue;
    picks.push({ section: "recent", item });
    seen.add(id);
  }

  const popular = [...popularStats]
    .map((stat) => ({ id: stat.menuItemId ?? stat.menu_item_id ?? "", quantity: stat.quantity }))
    .filter((stat) => stat.id && stat.quantity > 0 && !seen.has(stat.id))
    .sort((a, b) => b.quantity - a.quantity || a.id.localeCompare(b.id));

  for (const stat of popular) {
    const item = byId.get(stat.id);
    if (!item) continue;
    picks.push({ section: "popular", item, quantity: stat.quantity });
    seen.add(stat.id);
  }

  return picks;
}
