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

function TablePicker({
  activeTables,
  selectedTableId,
  loading,
  tileWidth,
  onSelectTable
}: {
  activeTables: HubBootstrap["tables"];
  selectedTableId: string | null;
  loading: boolean;
  tileWidth: number;
  onSelectTable: (tableId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>Tables</Text>
          <Text style={styles.muted}>{activeTables.length} tables available</Text>
        </View>
        {loading ? <ActivityIndicator /> : null}
      </View>
      {activeTables.length === 0 ? (
        <EmptyState title="No tables yet" text="Add floors and tables on the hub setup screen." />
      ) : (
        <View style={styles.tableGrid}>
          {activeTables.map((table) => (
            <TableTile key={table.id} table={table} selected={table.id === selectedTableId} tileWidth={tileWidth} onSelectTable={onSelectTable} />
          ))}
        </View>
      )}
    </View>
  );
}

function TableTile({
  table,
  selected,
  tileWidth,
  onSelectTable
}: {
  table: HubBootstrap["tables"][number];
  selected: boolean;
  tileWidth: number;
  onSelectTable: (tableId: string) => void;
}) {
  const state = getTableDisplayState(table);
  return (
    <Pressable
      style={[
        styles.tableTile,
        { width: tileWidth },
        state === "running" && styles.busyTable,
        state === "bill_printed" && styles.billedTable,
        selected && styles.selectedTable
      ]}
      onPress={() => onSelectTable(table.id)}
    >
      <Text style={styles.tableName} numberOfLines={1}>{table.name}</Text>
      <Text style={[styles.tableStatus, state !== "free" && styles.tableStatusBusy, state === "bill_printed" && styles.tableStatusBilled]}>
        {tableDisplayLabel(state)}
      </Text>
    </Pressable>
  );
}

export { TablePicker };
