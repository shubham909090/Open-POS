import { FormModal } from "./form-modal";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, FlatList, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable";
import { Plus, Search, X } from "lucide-react-native";
import { formatPosDateTime, getTableDisplayState, searchMenuItems, tableDisplayLabel, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";
import { amountInputToPaise, findMenuVariant, formatRupees, isValidAmountInput, paiseToRupeeInput } from "../lib/mobile-format";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { CollapsibleSection, EmptyState, LabeledMoneyInput, SummaryBox, UncontrolledInput } from "./app-shell";

function MenuScreen({
  selectedTableName,
  visibleMenu,
  saleGroupFilters,
  selectedSaleGroup,
  hasSearch,
  draftTotal,
  hasNewItems,
  draftQuantitiesByMenuItemId,
  draftSelectionLabelsByMenuItemId,
  searchValue,
  virtualized,
  saleGroups,
  productionUnits,
  onSearchChange,
  onSaleGroupChange,
  onAddItem,
  onAddOpenItem
}: {
  selectedTableName: string | null;
  visibleMenu: HubBootstrap["menuItems"];
  saleGroupFilters: Array<[SaleGroupKind, string]>;
  selectedSaleGroup: SaleGroupKind | null;
  hasSearch: boolean;
  draftTotal: number;
  hasNewItems: boolean;
  draftQuantitiesByMenuItemId: Record<string, number>;
  draftSelectionLabelsByMenuItemId: Record<string, string>;
  searchValue: string;
  virtualized: boolean;
  saleGroups: NonNullable<HubBootstrap["saleGroups"]>;
  productionUnits: HubBootstrap["productionUnits"];
  onSearchChange: (value: string) => void;
  onSaleGroupChange: (value: SaleGroupKind | null) => void;
  onAddItem: (menuItemId: string, variantId?: string) => void;
  onAddOpenItem: (input: { openName: string; openPricePaise: number; saleGroupId: string; productionUnitId?: string | null }) => boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 1000 && fontScale < 1.3 ? 3 : width >= 600 ? 2 : 1;
  const activeSaleGroups = saleGroups.filter((group) => group.active !== false && group.active !== 0);
  const activeProductionUnits = productionUnits.filter((unit) => unit.active !== false && unit.active !== 0);
  const defaultSaleGroupId = activeSaleGroups.find((group) => group.id === "sg-food")?.id ?? activeSaleGroups[0]?.id ?? "sg-food";
  const [openItemVisible, setOpenItemVisible] = useState(false);
  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [openItemGroupId, setOpenItemGroupId] = useState(defaultSaleGroupId);
  const [openItemUnit, setOpenItemUnit] = useState("default");
  const [openItemError, setOpenItemError] = useState<string | null>(null);
  const activeLabel = selectedSaleGroup ? saleGroupFilters.find(([kind]) => kind === selectedSaleGroup)?.[1] ?? "Best matches" : "All";
  const sections = [
    { title: hasSearch ? "Best matches" : activeLabel, data: visibleMenu }
  ].filter((section) => section.data.length > 0);
  const header = (
    <>
      <View style={styles.menuSearchRow}>
      <View style={styles.menuSearch}>
        <Search size={18} strokeWidth={1.7} color={palette.muted} />
        <TextInput
          accessibilityLabel="Search dishes"
          style={styles.menuSearchInput}
          value={searchValue}
          onChangeText={onSearchChange}
          autoCorrect={false}
          returnKeyType="search"
          placeholder="Search dishes…"
          placeholderTextColor={palette.muted}
        />
        {searchValue ? <Pressable accessibilityLabel="Clear dish search" style={styles.searchClear} onPress={() => onSearchChange("")}><X size={16} color={palette.muted} strokeWidth={1.7} /></Pressable> : null}
      </View>
      <Pressable accessibilityLabel="Add open item" style={styles.iconButton} disabled={!selectedTableName} onPress={() => { setOpenItemGroupId(defaultSaleGroupId); setOpenItemUnit("default"); setOpenItemError(null); setOpenItemVisible(true); }}><Plus size={20} color={palette.ink} /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.filterChips}>
        <Pressable accessibilityState={{ selected: selectedSaleGroup === null }} style={[styles.filterChip, selectedSaleGroup === null && styles.filterChipActive]} onPress={() => onSaleGroupChange(null)}>
          <Text style={[styles.filterChipText, selectedSaleGroup === null && styles.filterChipTextActive]}>All</Text>
        </Pressable>
        {saleGroupFilters.map(([kind, label]) => (
          <Pressable key={kind} accessibilityState={{ selected: selectedSaleGroup === kind }} style={[styles.filterChip, selectedSaleGroup === kind && styles.filterChipActive]} onPress={() => onSaleGroupChange(kind)}>
            <Text style={[styles.filterChipText, selectedSaleGroup === kind && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

    </>
  );
  const closeOpenItem = () => {
    setOpenItemVisible(false);
    setOpenItemError(null);
  };
  const submitOpenItem = () => {
    const openPricePaise = amountInputToPaise(openItemPrice);
    if (!openItemName.trim() || !isValidAmountInput(openItemPrice) || openPricePaise <= 0) {
      setOpenItemError("Enter an item name and a price above zero.");
      return;
    }
    const added = onAddOpenItem({
      openName: openItemName.trim(),
      openPricePaise,
      saleGroupId: openItemGroupId,
      ...(openItemUnit === "default" ? {} : { productionUnitId: openItemUnit === "none" ? null : openItemUnit })
    });
    if (!added) return;
    setOpenItemName("");
    setOpenItemPrice("");
    closeOpenItem();
  };
  const openItemModal = (
    <FormModal visible={openItemVisible} transparent animationType="fade" onRequestClose={closeOpenItem}>
      <View style={styles.popupBackdrop}>
        <View style={styles.popupCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.flexText}>
              <Text style={styles.sectionTitle}>Open item</Text>
              <Text style={styles.muted}>Table {selectedTableName}</Text>
            </View>
            <Pressable style={styles.secondaryButton} onPress={closeOpenItem}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.popupScroll} contentContainerStyle={styles.formStack} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Item name</Text>
              <TextInput
                accessibilityLabel="Open item name"
                style={styles.input}
                value={openItemName}
                onChangeText={(value) => setOpenItemName(value.slice(0, 160))}
                placeholder="Item name"
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
                maxLength={160}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price</Text>
              <TextInput
                accessibilityLabel="Open item price"
                style={styles.input}
                value={openItemPrice}
                onChangeText={setOpenItemPrice}
                placeholder="0.00"
                placeholderTextColor={palette.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                {activeSaleGroups.map((group) => (
                  <Pressable key={group.id} style={[styles.filterChip, openItemGroupId === group.id && styles.filterChipActive]} onPress={() => setOpenItemGroupId(group.id)}>
                    <Text style={[styles.filterChipText, openItemGroupId === group.id && styles.filterChipTextActive]}>{group.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Send to</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                <Pressable style={[styles.filterChip, openItemUnit === "default" && styles.filterChipActive]} onPress={() => setOpenItemUnit("default")}>
                  <Text style={[styles.filterChipText, openItemUnit === "default" && styles.filterChipTextActive]}>Group default</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, openItemUnit === "none" && styles.filterChipActive]} onPress={() => setOpenItemUnit("none")}>
                  <Text style={[styles.filterChipText, openItemUnit === "none" && styles.filterChipTextActive]}>No KOT</Text>
                </Pressable>
                {activeProductionUnits.map((unit) => (
                  <Pressable key={unit.id} style={[styles.filterChip, openItemUnit === unit.id && styles.filterChipActive]} onPress={() => setOpenItemUnit(unit.id)}>
                    <Text style={[styles.filterChipText, openItemUnit === unit.id && styles.filterChipTextActive]}>{unit.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {openItemError ? <Text style={styles.dangerText}>{openItemError}</Text> : null}
            <Pressable accessibilityLabel="Confirm open item" style={styles.primaryButton} onPress={submitOpenItem}>
              <Text style={styles.primaryButtonText}>Add open item</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </FormModal>
  );

  if (virtualized) {
    return (
      <>
        <View style={[styles.panel, styles.menuPanel, styles.virtualMenuPanel]}>
          <View style={styles.menuToolbar}>{header}</View>
          <FlatList
          key={`menu-${columns}`}
          data={selectedTableName ? visibleMenu : []}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.menuGridRow : undefined}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={columns > 1 ? [styles.menuGridTile, { maxWidth: columns === 3 ? "32.4%" : "49.2%" }] : undefined}><MenuItemRow
              menuItem={item}
              fillTile={columns > 1}
              draftQuantity={draftQuantitiesByMenuItemId[item.id] ?? 0}
              draftSelectionLabel={draftSelectionLabelsByMenuItemId[item.id]}
              onAddItem={onAddItem}
            /></View>
          )}
          ListEmptyComponent={
            !selectedTableName ? (
              <EmptyState title="No table selected" text="Choose a table to add dishes." />
            ) : (
              <EmptyState title="No dishes found" text="Try a different search." />
            )
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.virtualMenuList, hasNewItems && styles.screenContentWithDraft]}
          />
        </View>
        {openItemModal}
      </>
    );
  }

  return (
    <>
      <View style={[styles.panel, styles.menuPanel]}>
        {header}
      {!selectedTableName ? (
        <EmptyState title="No table selected" text="Choose a table to add dishes." />
      ) : sections.length === 0 ? (
        <EmptyState title="No dishes found" text="Try a different search." />
      ) : (
        sections.map((section) => (
          <MenuListSection
            key={section.title}
            title={section.title}
            items={section.data}
            draftQuantitiesByMenuItemId={draftQuantitiesByMenuItemId}
            draftSelectionLabelsByMenuItemId={draftSelectionLabelsByMenuItemId}
            onAddItem={onAddItem}
          />
        ))
      )}
      </View>
      {openItemModal}
    </>
  );
}

function MenuListSection({
  title,
  items,
  draftQuantitiesByMenuItemId,
  draftSelectionLabelsByMenuItemId,
  onAddItem
}: {
  title: string;
  items: HubBootstrap["menuItems"];
  draftQuantitiesByMenuItemId: Record<string, number>;
  draftSelectionLabelsByMenuItemId: Record<string, string>;
  onAddItem: (menuItemId: string, variantId?: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.menuSection}>
      <Text style={styles.subhead}>{title}</Text>
      <View style={styles.menuList}>
        {items.map((menuItem) => (
          <MenuItemRow
            key={menuItem.id}
            menuItem={menuItem}
            draftQuantity={draftQuantitiesByMenuItemId[menuItem.id] ?? 0}
            draftSelectionLabel={draftSelectionLabelsByMenuItemId[menuItem.id]}
            onAddItem={onAddItem}
          />
        ))}
      </View>
    </View>
  );
}

function MenuItemRow({
  menuItem,
  draftQuantity = 0,
  fillTile = false,
  draftSelectionLabel,
  onAddItem
}: {
  menuItem: HubBootstrap["menuItems"][number];
  draftQuantity?: number;
  fillTile?: boolean;
  draftSelectionLabel?: string;
  onAddItem: (menuItemId: string, variantId?: string) => void;
}) {
  const variants = menuItem.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  const activeVariants = variants.length || menuItem.sale_group_kind === "alcohol" ? variants : [{ id: "", label: "Regular", kind: "default", price_paise: menuItem.price_paise }];
  const hasMultipleVariants = activeVariants.length > 1;
  const singleVariant = activeVariants.length === 1 ? activeVariants[0]! : null;
  if (singleVariant) {
    // One price: the whole row adds it, so the tap target is the dish, not a small price button.
    const actionLabel = formatMobileMenuActionLabel({ kind: singleVariant.kind, label: singleVariant.label, pricePaise: singleVariant.price_paise });
    return (
      <Pressable
        accessibilityLabel={`Add ${menuItem.name}, ${actionLabel}`}
        style={[styles.menuItem, styles.menuItemInline, styles.menuItemTap, fillTile && styles.menuFillTile, draftQuantity > 0 && styles.menuItemSelected]}
        onPress={() => onAddItem(menuItem.id, singleVariant.id || undefined)}
      >
        <View style={styles.menuIdentity}>
          {draftQuantity > 0 ? <Text accessibilityLabel={`${draftQuantity} selected`} style={styles.menuSelectedQuantity}>{draftQuantity}×</Text> : null}
          <View style={styles.menuText}>
            <Text style={styles.menuName} numberOfLines={2}>{menuItem.name}</Text>
          </View>
        </View>
        <View style={styles.menuRowPrice}>
          <Text style={styles.menuRowPriceText}>{singleVariant.kind === "default" ? `₹${formatRupees(singleVariant.price_paise)}` : actionLabel}</Text>
          <View style={styles.menuRowPlus} importantForAccessibility="no"><Text style={styles.menuRowPlusText}>+</Text></View>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={[styles.menuItem, fillTile && styles.menuFillTile, draftQuantity > 0 && styles.menuItemSelected, styles.menuItemInline, hasMultipleVariants && draftSelectionLabel && styles.menuItemWithSelection, hasMultipleVariants && styles.menuItemStacked]}>
      <View style={[styles.menuIdentity, hasMultipleVariants && styles.menuIdentityFull]}>
        {draftQuantity > 0 ? <Text accessibilityLabel={`${draftQuantity} selected`} style={styles.menuSelectedQuantity}>{draftQuantity}×</Text> : null}
        <View style={styles.menuText}>
          <Text style={styles.menuName}>{menuItem.name}</Text>
        </View>
      </View>
      <View style={hasMultipleVariants ? styles.variantStack : styles.menuPriceBlock}>
        {activeVariants.length === 0 ? (
          <Text style={styles.muted}>Unavailable</Text>
        ) : activeVariants.length === 1 ? (
          (() => { const v = activeVariants[0]!; return (
          <View style={styles.singleVariantBlock}>
            <Pressable accessibilityLabel={`Add ${menuItem.name}, ${formatMobileMenuActionLabel({ kind: v.kind, pricePaise: v.price_paise })}`} style={styles.addButton} onPress={() => onAddItem(menuItem.id, v.id || undefined)}>
              <Text style={styles.addButtonText}>{formatMobileMenuActionLabel({ kind: v.kind, pricePaise: v.price_paise })}</Text>
            </Pressable>
          </View>); })()
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.variantWrap}>
            {activeVariants.map((variant) => (
              <Pressable key={variant.id || menuItem.id} accessibilityLabel={`Add ${menuItem.name}, ${variant.label}, ₹${formatRupees(variant.price_paise)}`} style={styles.variantChip} onPress={() => onAddItem(menuItem.id, variant.id || undefined)}>
                <Text style={styles.filterChipText}>{variant.label}</Text><Text style={styles.variantPrice}>₹{formatRupees(variant.price_paise)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      {hasMultipleVariants && draftSelectionLabel ? (
        <View style={styles.draftSelectionPill}>
          <Text style={styles.draftSelectionText} numberOfLines={1}>Added {draftSelectionLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

export { MenuItemRow, MenuScreen };
