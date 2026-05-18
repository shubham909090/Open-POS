import { create } from "zustand";
import type { MenuItem } from "./hub-api.js";

export type HubView = "setup" | "orders" | "alcohol" | "kitchen" | "reports" | "advanced";
export type OrderPanel = "new" | "sent" | "bill";

export interface DraftItem {
  lineKey: string;
  menuItemId: string;
  menuItemVariantId?: string;
  name: string;
  variantLabel?: string;
  pricePaise: number;
  quantity: number;
  openName?: string;
  saleGroupId?: string;
  productionUnitId?: string | null;
  note?: string;
}

interface HubUiState {
  view: HubView;
  selectedTableId: string | null;
  orderPanel: OrderPanel;
  menuSearch: string;
  recentMenuItemIds: string[];
  selectedKdsUnitId: string | null;
  drafts: Record<string, Record<string, DraftItem>>;
  setView: (view: HubView) => void;
  selectTable: (tableId: string) => void;
  clearSelectedTable: () => void;
  setOrderPanel: (panel: OrderPanel) => void;
  setMenuSearch: (value: string) => void;
  setSelectedKdsUnitId: (unitId: string | null) => void;
  addDraftItem: (tableId: string, item: MenuItem, variantId?: string) => void;
  addOpenDraftItem: (tableId: string, item: Omit<DraftItem, "lineKey" | "menuItemId" | "quantity">) => void;
  changeDraftQty: (tableId: string, menuItemId: string, delta: number) => void;
  setDraftItemNote: (tableId: string, lineKey: string, note: string) => void;
  clearDraft: (tableId: string) => void;
}

export const useHubStore = create<HubUiState>((set) => ({
  view: "setup",
  selectedTableId: null,
  orderPanel: "new",
  menuSearch: "",
  recentMenuItemIds: [],
  selectedKdsUnitId: null,
  drafts: {},
  setView: (view) => set({ view }),
  selectTable: (tableId) => set({ selectedTableId: tableId, orderPanel: "new" }),
  clearSelectedTable: () => set({ selectedTableId: null, orderPanel: "new" }),
  setOrderPanel: (orderPanel) => set({ orderPanel }),
  setMenuSearch: (menuSearch) => set({ menuSearch }),
  setSelectedKdsUnitId: (selectedKdsUnitId) => set({ selectedKdsUnitId }),
  addDraftItem: (tableId, item, variantId) =>
    set((state) => {
      const tableDraft = state.drafts[tableId] ?? {};
      const variant = item.variants?.find((entry) => entry.id === variantId && Boolean(entry.active)) ?? item.variants?.find((entry) => Boolean(entry.active));
      if (!variant && item.sale_group_kind === "alcohol") return state;
      const key = variant ? `${item.id}:${variant.id}` : item.id;
      const current = tableDraft[key];
      return {
        recentMenuItemIds: [item.id, ...state.recentMenuItemIds.filter((id) => id !== item.id)].slice(0, 12),
        drafts: {
          ...state.drafts,
          [tableId]: {
            ...tableDraft,
            [key]: {
              menuItemId: item.id,
              lineKey: key,
              menuItemVariantId: variant?.id,
              name: item.name,
              variantLabel: variant?.kind === "default" ? undefined : variant?.label,
              pricePaise: variant?.price_paise ?? item.price_paise,
              quantity: (current?.quantity ?? 0) + 1
            }
          }
        }
      };
    }),
  addOpenDraftItem: (tableId, item) =>
    set((state) => {
      const tableDraft = state.drafts[tableId] ?? {};
      const id = `open-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return {
        drafts: {
          ...state.drafts,
          [tableId]: {
            ...tableDraft,
            [id]: {
              menuItemId: id,
              lineKey: id,
              name: item.name,
              openName: item.name,
              pricePaise: item.pricePaise,
              saleGroupId: item.saleGroupId,
              productionUnitId: item.productionUnitId ?? null,
              quantity: 1
            }
          }
        }
      };
    }),
  changeDraftQty: (tableId, menuItemId, delta) =>
    set((state) => {
      const tableDraft = state.drafts[tableId] ?? {};
      const current = tableDraft[menuItemId];
      if (!current) return state;
      const nextQuantity = Math.max(0, current.quantity + delta);
      const nextTableDraft = { ...tableDraft };
      if (nextQuantity === 0) delete nextTableDraft[menuItemId];
      else nextTableDraft[menuItemId] = { ...current, quantity: nextQuantity };
      return { drafts: { ...state.drafts, [tableId]: nextTableDraft } };
    }),
  setDraftItemNote: (tableId, lineKey, note) =>
    set((state) => {
      const tableDraft = state.drafts[tableId] ?? {};
      const current = tableDraft[lineKey];
      if (!current) return state;
      return {
        drafts: {
          ...state.drafts,
          [tableId]: {
            ...tableDraft,
            [lineKey]: { ...current, note }
          }
        }
      };
    }),
  clearDraft: (tableId) =>
    set((state) => ({
      drafts: { ...state.drafts, [tableId]: {} }
    }))
}));
