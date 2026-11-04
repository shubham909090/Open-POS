import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Pressable } from "./pressable";
import type { HubBootstrap, KdsTicket } from "../lib/hub-client";
import { palette, styles } from "../styles/app-styles";
import { EmptyState } from "./app-shell";
import { kitchenItemPresentation, kitchenTicketPresentation } from "./kitchen-ticket-presentation";

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
        {loading ? <ActivityIndicator color={palette.green} /> : null}
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
            const ticketKind = kitchenTicketPresentation(ticket.type);
            const kotCardStatus = ticket.status === "ready" ? styles.kotCardReady
              : ticket.status === "preparing" ? styles.kotCardPreparing
              : ticket.status === "served" ? styles.kotCardServed
              : undefined;
            return (
              <View key={ticket.id} style={[styles.kotCard, kotCardStatus, ticketKind.cancellation && styles.kotCardCancellation]}>
                <View style={styles.kotHeader}>
                  <View style={styles.flexText}>
                    <Text style={styles.kotTable}>Table {ticket.table_name}</Text>
                    <Text style={[styles.kotType, ticketKind.cancellation && styles.kotRemovalText]}>KOT #{ticket.sequence} · {ticketKind.label}</Text>
                  </View>
                  <View style={[styles.kotStatusPill, ticket.status === "ready" && styles.kotStatusReady]}>
                    <Text style={[styles.kotStatusText, ticket.status === "ready" && styles.kotStatusTextReady]}>{ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}</Text>
                  </View>
                </View>
                <View style={styles.kotItems}>
                  {ticket.note ? (
                    <Text style={styles.smallMuted}>Note: {ticket.note}</Text>
                  ) : null}
                  {ticket.items.map((item, index) => {
                    const change = kitchenItemPresentation(item.quantity_delta, item.note_snapshot);
                    return (
                    <View key={`${ticket.id}-${index}`} style={styles.kotItemRow}>
                      <View style={styles.kotChangeQuantity}>
                        <Text style={[styles.kotQty, change.kind === "remove" && styles.kotRemovalText]}>{change.quantity}</Text>
                        {change.kind !== "add" ? <Text style={[styles.kotChangeAction, change.kind === "remove" && styles.kotRemovalText]}>{change.action}</Text> : null}
                      </View>
                      <View style={styles.flexText}>
                        <Text style={styles.kotItemName}>{item.name_snapshot}</Text>
                        {item.note_snapshot ? <Text style={styles.smallMuted}>{item.note_snapshot}</Text> : null}
                      </View>
                    </View>
                    );
                  })}
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
