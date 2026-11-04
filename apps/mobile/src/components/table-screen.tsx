import { useEffect, useState } from "react";
import { ActivityIndicator, Text, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTableDisplayState, tableDisplayLabel } from "@gaurav-pos/shared";

import type { HubBootstrap } from "../lib/hub-client";
import { groupTablesByFloor, type TableOrder } from "../lib/table-flow";
import { palette, styles } from "../styles/app-styles";
import { EmptyState } from "./app-shell";
import { tableElapsed } from "../lib/table-presentation";
import { formatRupees } from "../lib/mobile-format";
import { Pressable } from "./pressable";

const TABLE_ORDER_KEY = "gaurav-pos:table-order";
const TABLE_GRID_GAP = 8;
/** Two compact lines: name + state, then timer + amount. */
const TABLE_TILE_HEIGHT = 58;

/** Per-phone table order. Name is the default; Custom keeps the positions set on the hub. */
export function useTableOrderPreference() {
  const [order, setOrderState] = useState<TableOrder>("name");
  useEffect(() => {
    void AsyncStorage.getItem(TABLE_ORDER_KEY).then((stored) => {
      if (stored === "custom") setOrderState("custom");
    });
  }, []);
  const setOrder = (next: TableOrder) => {
    setOrderState(next);
    void AsyncStorage.setItem(TABLE_ORDER_KEY, next);
  };
  return { tableOrder: order, setTableOrder: setOrder };
}

export function TableOrderToggle({ order, onChange }: { order: TableOrder; onChange: (order: TableOrder) => void }) {
  return (
    <View style={styles.orderSegmented} accessibilityRole="radiogroup" accessibilityLabel="Table order">
      {(["name", "custom"] as const).map((entry) => (
        <Pressable
          key={entry}
          accessibilityRole="radio"
          accessibilityState={{ selected: order === entry }}
          style={[styles.orderSegment, order === entry && styles.orderSegmentActive]}
          onPress={() => onChange(entry)}
        >
          <Text style={[styles.orderSegmentText, order === entry && styles.orderSegmentTextActive]}>{entry === "name" ? "Name" : "Custom"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TablePicker({
  activeTables,
  floors,
  selectedTableId,
  loading,
  tableOrder,
  onTableOrderChange,
  onSelectTable
}: {
  activeTables: HubBootstrap["tables"];
  floors: HubBootstrap["floors"];
  selectedTableId: string | null;
  loading: boolean;
  tableOrder: TableOrder;
  onTableOrderChange: (order: TableOrder) => void;
  onSelectTable: (tableId: string) => void;
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const floorGroups = groupTablesByFloor(activeTables, floors, tableOrder);
  const availableCount = activeTables.filter((table) => getTableDisplayState(table) === "free").length;
  // Keep enough width for table identity, state and money on narrow phones.
  const normalColumns = gridWidth >= 900 ? 8 : gridWidth >= 640 ? 6 : gridWidth >= 420 ? 4 : 3;
  const columns = fontScale >= 1.3 ? Math.max(2, normalColumns - 1) : normalColumns;
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - TABLE_GRID_GAP * (columns - 1)) / columns) : undefined;
  // Every tile shares one height so rows never go uneven when a live table sits among free ones.
  const tileHeight = Math.round(TABLE_TILE_HEIGHT * Math.min(Math.max(fontScale, 1), 1.6));
  return (
    <View style={styles.tableSection} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.cardHeader, fontScale >= 1.3 && styles.tableHeaderStack]}>
        <View style={styles.flexText}>
          <Text style={styles.tableCount}>{availableCount} free · {activeTables.length - availableCount} active</Text>
        </View>
        {loading ? <ActivityIndicator color={palette.green} /> : null}
        {activeTables.length > 1 ? <TableOrderToggle order={tableOrder} onChange={onTableOrderChange} /> : null}
      </View>
      {activeTables.length === 0 ? (
        <EmptyState title="No tables yet" text="Add tables on the hub." />
      ) : (
        <View style={styles.floorTableStack}>
          {floorGroups.map((group) => (
            <View key={group.floorId} style={styles.floorTableGroup}>
              {floorGroups.length > 1 ? (
                <View style={styles.floorTableHeader}>
                  <Text style={styles.subhead}>{group.floorName}</Text>
                </View>
              ) : null}
              <View style={styles.tableGrid}>
                {group.tables.map((table) => (
                  <TableTile key={table.id} table={table} width={tileWidth} height={tileHeight} selected={table.id === selectedTableId} onSelectTable={onSelectTable} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function TableTile({
  table,
  width,
  height,
  selected,
  onSelectTable
}: {
  table: HubBootstrap["tables"][number];
  width?: number;
  height: number;
  selected: boolean;
  onSelectTable: (tableId: string) => void;
}) {
  const state = getTableDisplayState(table);
  const elapsed = tableElapsed(table);
  const live = state !== "free";
  const amount = live && typeof table.current_order_total_paise === "number" ? table.current_order_total_paise : null;
  const longRunning = state === "running" && tableMinutesOpen(table) >= LONG_RUNNING_TABLE_MINUTES;
  const stateLabel = state === "bill_printed" ? "Billed" : tableDisplayLabel(state);
  return (
    <Pressable
      accessibilityLabel={`Table ${table.name}, ${stateLabel}${state === "bill_printed" && elapsed ? ` ${elapsed} ago` : ""}`}
      accessibilityState={{ selected }}
      style={[
        styles.tableTile,
        { height },
        width ? { width } : null,
        live && styles.liveTable,
        state === "running" && styles.busyTable,
        state === "bill_printed" && styles.billedTable,
        selected && styles.selectedTable
      ]}
      onPress={() => onSelectTable(table.id)}
    >
      <View style={styles.tableTopline}>
        <Text style={[styles.tableName, live && styles.tableNameLive]} numberOfLines={1}>{table.name}</Text>
        {live ? (
          <Text style={[styles.tableStatus, styles.tableStatusBusy, state === "bill_printed" && styles.tableStatusBilled]} numberOfLines={1}>
            {stateLabel}
          </Text>
        ) : null}
      </View>
      {live ? (
        <View style={styles.tableMetrics}>
          {elapsed ? <Text style={[styles.tableElapsed, longRunning && styles.tableElapsedLong]} numberOfLines={1}>{elapsed}</Text> : null}
          {amount !== null ? <Text style={styles.tableAmount} numberOfLines={1}>₹{formatRupees(amount)}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** A running table older than this shows a red timer so forgotten checks stand out (matches the hub). */
const LONG_RUNNING_TABLE_MINUTES = 180;

function tableMinutesOpen(table: HubBootstrap["tables"][number]): number {
  if (!table.occupied_at) return 0;
  const start = new Date(table.occupied_at).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 60_000)) : 0;
}

export { TablePicker };
