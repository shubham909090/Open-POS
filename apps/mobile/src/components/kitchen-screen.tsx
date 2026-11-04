import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable";
import type { HubBootstrap, KdsTicket } from "../lib/hub-client";
import { palette, styles } from "../styles/app-styles";
import { EmptyState } from "./app-shell";
import { kitchenItemPresentation, kitchenTicketAge, kitchenTicketNeedsAcknowledgment, kitchenTicketPresentation } from "./kitchen-ticket-presentation";

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
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  const { width } = useWindowDimensions();
  // Kitchen screens are often tablets: lay tickets out in columns so a rush fits on screen.
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const [listWidth, setListWidth] = useState(0);
  const ticketWidth = columns > 1 && listWidth > 0 ? Math.floor((listWidth - KOT_GRID_GAP * (columns - 1)) / columns) : undefined;
  const renderTicket = (ticket: KdsTicket) => {
            const ticketKind = kitchenTicketPresentation(ticket.type);
            const acknowledgeOnly = kitchenTicketNeedsAcknowledgment(ticket.type, ticket.items);
            const kotCardStatus = ticket.status === "ready" ? styles.kotCardReady
              : ticket.status === "preparing" ? styles.kotCardPreparing
              : ticket.status === "served" ? styles.kotCardServed
              : undefined;
            return (
              <View key={ticket.id} style={[styles.kotCard, kotCardStatus, ticketKind.cancellation && styles.kotCardCancellation]}>
                <View style={styles.kotHeader}>
                  <View style={styles.flexText}>
                    <Text style={styles.kotTable}>Table {ticket.table_name}</Text>
                    <Text style={[styles.kotType, ticketKind.cancellation && styles.kotRemovalText]}>KOT #{ticket.sequence} · {ticketKind.label}{kitchenTicketAge(ticket.created_at, now) ? ` · ${kitchenTicketAge(ticket.created_at, now)}` : ""}</Text>
                  </View>
                  <View style={[styles.kotStatusPill, ticket.status === "ready" && styles.kotStatusReady]}>
                    <Text style={[styles.kotStatusText, ticket.status === "ready" && styles.kotStatusTextReady]}>{acknowledgeOnly ? ticket.status === "served" ? "Acknowledged" : "Needs acknowledgment" : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}</Text>
                  </View>
                </View>
                <View style={styles.kotItems}>
                  {ticket.note ? (
                    <Text style={styles.kotNote}>Note: {ticket.note}</Text>
                  ) : null}
                  {ticket.items.map((item, index) => {
                    const change = kitchenItemPresentation(item.quantity_delta, item.note_snapshot, ticket.type);
                    return (
                    <View key={`${ticket.id}-${index}`} style={styles.kotItemRow}>
                      <View style={styles.kotChangeQuantity}>
                        <Text style={[styles.kotQty, change.kind === "remove" && styles.kotRemovalText]}>{change.quantity}</Text>
                        {change.kind !== "add" ? <Text style={[styles.kotChangeAction, change.kind === "remove" && styles.kotRemovalText]}>{change.action}</Text> : null}
                      </View>
                      <View style={styles.flexText}>
                        <Text style={styles.kotItemName}>{item.name_snapshot}</Text>
                        {item.note_snapshot ? <Text style={styles.kotItemNote}>{item.note_snapshot}</Text> : null}
                      </View>
                    </View>
                    );
                  })}
                </View>
                <View style={styles.kotActions}>
                  {acknowledgeOnly ? (
                    <Pressable accessibilityLabel={`Acknowledge ticket ${ticket.sequence}`} style={[styles.secondaryButton, styles.kotActionButton, (sending || ticket.status === "served") && styles.buttonDisabled]} disabled={sending || ticket.status === "served"} onPress={() => onStatusChange(ticket.id, "served")}>
                      <Text style={styles.secondaryButtonText}>Acknowledge</Text>
                    </Pressable>
                  ) : <>
                  {ticket.status === "queued" ? (
                    <Pressable style={[styles.secondaryButton, styles.kotActionButton, styles.kotStartButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "preparing")}>
                      <Text style={styles.kotStartButtonText}>Start</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status !== "ready" ? (
                    <Pressable style={[styles.primaryButton, styles.kotActionButton, styles.kotReadyButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "ready")}>
                      <Text style={styles.primaryButtonText}>Ready</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.primaryButton, styles.kotActionButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onStatusChange(ticket.id, "served")}>
                      <Text style={styles.primaryButtonText}>Served</Text>
                    </Pressable>
                  )}
                  </>}
                </View>
              </View>
            );
  };
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
        <EmptyState title="No kitchen screen enabled" text="Enable a kitchen screen on the hub." />
      ) : tickets.length === 0 ? (
        <EmptyState title="No active tickets" text="New KOTs appear here." />
      ) : (
        <View style={columns > 1 ? styles.kotGrid : styles.kotList} onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
          {columns === 1 || !ticketWidth
            ? tickets.map(renderTicket)
            : ticketColumns(tickets, columns).map((column, index) => (
                <View key={index} style={[styles.kotList, { width: ticketWidth }]}>{column.map(renderTicket)}</View>
              ))}
        </View>
      )}
    </View>
  );
}

/** Oldest first, dealt left to right, so each column stacks without holes under short tickets. */
function ticketColumns(tickets: KdsTicket[], count: number): KdsTicket[][] {
  const columns: KdsTicket[][] = Array.from({ length: count }, () => []);
  tickets.forEach((ticket, index) => columns[index % count]!.push(ticket));
  return columns;
}

/** Matches styles.kotGrid gap. */
const KOT_GRID_GAP = 10;

export { KitchenScreen };
