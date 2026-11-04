import { useEffect, useState } from "react";
import { ActivityIndicator, Text, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTableDisplayState, tableDisplayLabel } from "@gaurav-pos/shared";

import type { HubBootstrap } from "../lib/hub-client";
import { groupTablesByFloor, type TableOrder } from "../lib/table-flow";
import { palette, styles } from "../styles/app-styles";
import { EmptyState } from "./app-shell";
import { Pressable } from "./pressable";

const TABLE_ORDER_KEY = "gaurav-pos:table-order";
const TABLE_GRID_GAP = 8;

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
  // Three columns keep a full floor visible on a phone; tablets get wider tiles, not more noise.
  const normalColumns = gridWidth >= 600 ? 5 : gridWidth >= 420 ? 4 : 3;
  const columns = fontScale >= 1.3 ? Math.max(2, normalColumns - 1) : normalColumns;
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - TABLE_GRID_GAP * (columns - 1)) / columns) : undefined;
  return (
    <View style={styles.tableSection} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.cardHeader, fontScale >= 1.3 && styles.tableHeaderStack]}>
        <View style={styles.flexText}>
          <Text style={styles.tableCount}>{availableCount} free · {activeTables.length - availableCount} in service</Text>
        </View>
        {loading ? <ActivityIndicator color={palette.green} /> : null}
        {activeTables.length > 1 ? <TableOrderToggle order={tableOrder} onChange={onTableOrderChange} /> : null}
      </View>
      {activeTables.length === 0 ? (
        <EmptyState title="No tables yet" text="Add floors and tables on the hub setup screen." />
      ) : (
        <View style={styles.floorTableStack}>
          {floorGroups.map((group) => (
            <View key={group.floorId} style={styles.floorTableGroup}>
              {floorGroups.length > 1 ? (
                <View style={styles.floorTableHeader}>
                  <Text style={styles.subhead}>{group.floorName}</Text>
                  <Text style={styles.smallMuted}>{group.tables.length}</Text>
                </View>
              ) : null}
              <View style={styles.tableGrid}>
                {group.tables.map((table) => (
                  <TableTile key={table.id} table={table} width={tileWidth} selected={table.id === selectedTableId} onSelectTable={onSelectTable} />
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
  selected,
  onSelectTable
}: {
  table: HubBootstrap["tables"][number];
  width?: number;
  selected: boolean;
  onSelectTable: (tableId: string) => void;
}) {
  const state = getTableDisplayState(table);
  return (
    <Pressable
      accessibilityLabel={`Table ${table.name}, ${tableDisplayLabel(state)}`}
      accessibilityState={{ selected }}
      style={[
        styles.tableTile,
        width ? { width } : null,
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
