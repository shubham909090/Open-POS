import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { formatPosDateTime, getTableDisplayState, searchMenuItems, tableDisplayLabel, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";
import { amountInputToPaise, categoryToneFor, findMenuVariant, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
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
  draftQuantitiesByMenuItemId,
  draftSelectionLabelsByMenuItemId,
  searchValue,
  virtualized,
  onSearchChange,
  onSaleGroupChange,
  onAddItem
}: {
  selectedTableName: string | null;
  visibleMenu: HubBootstrap["menuItems"];
  saleGroupFilters: Array<[SaleGroupKind, string]>;
  selectedSaleGroup: SaleGroupKind | null;
  hasSearch: boolean;
  draftTotal: number;
  draftQuantitiesByMenuItemId: Record<string, number>;
  draftSelectionLabelsByMenuItemId: Record<string, string>;
  searchValue: string;
  virtualized: boolean;
  onSearchChange: (value: string) => void;
  onSaleGroupChange: (value: SaleGroupKind | null) => void;
  onAddItem: (menuItemId: string, variantId?: string) => void;
}) {
  const activeLabel = selectedSaleGroup ? saleGroupFilters.find(([kind]) => kind === selectedSaleGroup)?.[1] ?? "Best matches" : "All";
  const sections = [
    { title: hasSearch ? "Best matches" : activeLabel, data: visibleMenu }
  ].filter((section) => section.data.length > 0);
  const header = (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Menu</Text>
          <Text style={styles.muted}>{selectedTableName ? `Adding for Table ${selectedTableName}` : "Choose a table first"}</Text>
        </View>
        <Text style={styles.totalText}>Rs {formatRupees(draftTotal)}</Text>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Search dishes</Text>
        <TextInput
          style={styles.input}
          value={searchValue}
          onChangeText={onSearchChange}
          autoCorrect={false}
          returnKeyType="search"
          placeholder="Type dish name"
          placeholderTextColor={palette.muted}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.filterChips}>
        <Pressable style={[styles.filterChip, selectedSaleGroup === null && styles.filterChipActive]} onPress={() => onSaleGroupChange(null)}>
          <Text style={[styles.filterChipText, selectedSaleGroup === null && styles.filterChipTextActive]}>All</Text>
        </Pressable>
        {saleGroupFilters.map(([kind, label]) => (
          <Pressable key={kind} style={[styles.filterChip, selectedSaleGroup === kind && styles.filterChipActive]} onPress={() => onSaleGroupChange(kind)}>
            <Text style={[styles.filterChipText, selectedSaleGroup === kind && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );

  if (virtualized) {
    return (
      <View style={[styles.panel, styles.menuPanel, styles.virtualMenuPanel]}>
        <SectionList
          sections={selectedTableName ? sections : []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MenuItemRow
              menuItem={item}
              draftQuantity={draftQuantitiesByMenuItemId[item.id] ?? 0}
              draftSelectionLabel={draftSelectionLabelsByMenuItemId[item.id]}
              onAddItem={onAddItem}
            />
          )}
          renderSectionHeader={({ section }) => <Text style={[styles.subhead, styles.menuSectionHeader]}>{section.title}</Text>}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !selectedTableName ? (
              <EmptyState title="No table selected" text="Tap a table, then add dishes here." />
            ) : (
              <EmptyState title="No dishes found" text="Check spelling, clear filters, or add dishes on the hub." />
            )
          }
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.virtualMenuList}
        />
      </View>
    );
  }

  return (
    <View style={[styles.panel, styles.menuPanel]}>
      {header}
      {!selectedTableName ? (
        <EmptyState title="No table selected" text="Tap a table, then add dishes here." />
      ) : sections.length === 0 ? (
        <EmptyState title="No dishes found" text="Check spelling, clear filters, or add dishes on the hub." />
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
  draftSelectionLabel,
  onAddItem
}: {
  menuItem: HubBootstrap["menuItems"][number];
  draftQuantity?: number;
  draftSelectionLabel?: string;
  onAddItem: (menuItemId: string, variantId?: string) => void;
}) {
  const variants = menuItem.variants?.filter((variant) => Boolean(variant.active)) ?? [];
  const activeVariants = variants.length || menuItem.sale_group_kind === "alcohol" ? variants : [{ id: "", label: "Regular", kind: "default", price_paise: menuItem.price_paise }];
  const categoryTone = categoryToneFor(menuItem.sale_group_kind);
  const hasMultipleVariants = activeVariants.length > 1;
  return (
    <View style={[styles.menuItem, draftQuantity > 0 && styles.menuItemSelected, styles.menuItemInline, draftSelectionLabel && styles.menuItemWithSelection, hasMultipleVariants && styles.menuItemVariantRow]}>
      {draftQuantity > 0 ? (
        <View style={styles.draftMenuBadge} accessibilityLabel={`${draftQuantity} selected`}>
          <Text style={styles.draftMenuBadgeText}>{draftQuantity}x</Text>
        </View>
      ) : null}
      <View style={[styles.menuIdentity, draftQuantity > 0 && styles.menuIdentityWithBadge]}>
        <View style={[styles.menuCategoryIcon, { backgroundColor: categoryTone.soft }]}>
          <Text style={[styles.menuCategoryIconText, { color: categoryTone.ink }]}>{categoryTone.icon}</Text>
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuName} numberOfLines={2}>{menuItem.name}</Text>
          <Text style={[styles.muted, { color: categoryTone.ink }]} numberOfLines={1}>{menuItem.sale_group_name ?? menuItem.production_unit_name ?? "Menu"}</Text>
        </View>
      </View>
      <View style={hasMultipleVariants ? styles.variantStripBlock : styles.menuPriceBlock}>
        {activeVariants.length === 0 ? (
          <Text style={styles.muted}>Unavailable</Text>
        ) : activeVariants.length === 1 ? (
          (() => { const v = activeVariants[0]!; return (
          <View style={styles.singleVariantBlock}>
            <Pressable style={styles.addButton} onPress={() => onAddItem(menuItem.id, v.id || undefined)}>
              <Text style={styles.addButtonText}>{formatMobileMenuActionLabel({ kind: v.kind, pricePaise: v.price_paise })}</Text>
            </Pressable>
          </View>); })()
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.variantWrap}>
            {activeVariants.map((variant) => (
              <Pressable key={variant.id || menuItem.id} style={styles.variantChip} onPress={() => onAddItem(menuItem.id, variant.id || undefined)}>
                <Text style={styles.variantPrice} numberOfLines={1}>{formatMobileMenuActionLabel({ kind: variant.kind, label: variant.label, pricePaise: variant.price_paise })}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      {draftSelectionLabel ? (
        <View style={styles.draftSelectionPill}>
          <Text style={styles.draftSelectionText} numberOfLines={1}>Added {draftSelectionLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

export { MenuItemRow, MenuScreen };
