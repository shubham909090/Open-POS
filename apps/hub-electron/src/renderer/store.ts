import { create } from "zustand";
import type { MenuItem } from "./hub-api.js";

export type HubView = "setup" | "orders" | "kitchen" | "reports" | "advanced";
export type OrderPanel = "new" | "sent" | "bill";

export interface DraftItem {
  menuItemId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  openName?: string;
  saleGroupId?: string;
  productionUnitId?: string | null;
}

interface HubUiState {
  view: HubView;
  selectedTableId: string | null;
  orderPanel: OrderPanel;
  menuSearch: string;
  selectedKdsUnitId: string | null;
  drafts: Record<string, Record<string, DraftItem>>;
  setView: (view: HubView) => void;
  selectTable: (tableId: string) => void;
  setOrderPanel: (panel: OrderPanel) => void;
  setMenuSearch: (value: string) => void;
  setSelectedKdsUnitId: (unitId: string | null) => void;
  addDraftItem: (tableId: string, item: MenuItem) => void;
  addOpenDraftItem: (tableId: string, item: Omit<DraftItem, "menuItemId" | "quantity">) => void;
  changeDraftQty: (tableId: string, menuItemId: string, delta: number) => void;
  clearDraft: (tableId: string) => void;
}

export const useHubStore = create<HubUiState>((set) => ({
  view: "setup",
  selectedTableId: null,
  orderPanel: "new",
  menuSearch: "",
  selectedKdsUnitId: null,
  drafts: {},
  setView: (view) => set({ view }),
  selectTable: (tableId) => set({ selectedTableId: tableId, orderPanel: "new" }),
  setOrderPanel: (orderPanel) => set({ orderPanel }),
  setMenuSearch: (menuSearch) => set({ menuSearch }),
  setSelectedKdsUnitId: (selectedKdsUnitId) => set({ selectedKdsUnitId }),
  addDraftItem: (tableId, item) =>
    set((state) => {
      const tableDraft = state.drafts[tableId] ?? {};
      const current = tableDraft[item.id];
      return {
        drafts: {
          ...state.drafts,
          [tableId]: {
            ...tableDraft,
            [item.id]: {
              menuItemId: item.id,
              name: item.name,
              pricePaise: item.price_paise,
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
  clearDraft: (tableId) =>
    set((state) => ({
      drafts: { ...state.drafts, [tableId]: {} }
    }))
}));
