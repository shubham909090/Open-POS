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

function KitchenScreen({
  units,
  selectedUnitId,
  tickets,
  loading,
  sending,
  onSelectUnit,
  onStatusChange
}: {
  units: HubBootstrap["productionUnits"];
  selectedUnitId: string;
  tickets: KdsTicket[];
  loading: boolean;
  sending: boolean;
  onSelectUnit: (unitId: string) => void;
  onStatusChange: (kotId: string, status: "preparing" | "ready" | "served") => void;
}) {
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  return (
    <View style={[styles.panel, styles.kitchenPanel]}>
      <View style={styles.cardHeader}>
        <View style={styles.flexText}>
          <Text style={styles.sectionTitle}>{selectedUnit?.name ?? "Kitchen"}</Text>
          <Text style={styles.muted}>{tickets.length} active ticket{tickets.length === 1 ? "" : "s"}</Text>
        </View>
        {loading ? <ActivityIndicator /> : null}
      </View>

      {units.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {units.map((unit) => (
            <Pressable key={unit.id} style={[styles.filterChip, selectedUnitId === unit.id && styles.filterChipActive]} onPress={() => onSelectUnit(unit.id)}>
              <Text style={[styles.filterChipText, selectedUnitId === unit.id && styles.filterChipTextActive]}>{unit.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {units.length === 0 ? (
        <EmptyState title="No kitchen screen enabled" text="Enable Kitchen screen on the hub for the counters that should appear here." />
      ) : tickets.length === 0 ? (
        <EmptyState title="No active tickets" text="New KOTs will appear here as soon as waiters send items." />
      ) : (
        <View style={styles.kotList}>
          {tickets.map((ticket) => {
            const kotCardStatus = ticket.status === "ready" ? styles.kotCardReady
              : ticket.status === "preparing" ? styles.kotCardPreparing
              : ticket.status === "served" ? styles.kotCardServed
              : undefined;
            return (
              <View key={ticket.id} style={[styles.kotCard, kotCardStatus]}>
                <View style={styles.kotHeader}>
                  <View style={styles.flexText}>
                    <Text style={styles.kotTable}>Table {ticket.table_name}</Text>
                    <Text style={styles.muted}>KOT #{ticket.sequence}</Text>
                  </View>
                  <View style={[styles.kotStatusPill, ticket.status === "ready" && styles.kotStatusReady]}>
                    <Text style={[styles.kotStatusText, ticket.status === "ready" && styles.kotStatusTextReady]}>{ticket.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.kotItems}>
                  {ticket.note ? (
                    <Text style={styles.smallMuted}>Note: {ticket.note}</Text>
                  ) : null}
                  {ticket.items.map((item, index) => (
                    <View key={`${ticket.id}-${index}`} style={styles.kotItemRow}>
                      <Text style={styles.kotQty}>{Math.abs(item.quantity_delta)}x</Text>
                      <Text style={styles.kotItemName}>{item.name_snapshot}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.kotActions}>
                  {ticket.status === "queued" ? (
                    <Pressable style={[styles.secondaryButton, styles.kotActionButton, styles.kotStartButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "preparing")}>
                      <Text style={styles.kotStartButtonText}>Start</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status !== "ready" ? (
                    <Pressable style={[styles.primaryButton, styles.kotActionButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "ready")}>
                      <Text style={styles.primaryButtonText}>Ready</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.primaryButton, styles.kotActionButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "served")}>
                      <Text style={styles.primaryButtonText}>Served</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export { KitchenScreen };
