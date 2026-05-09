import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { OrderItemInput } from "@gaurav-pos/shared";
import { HubClient, type HubBootstrap } from "./lib/hub-client";
import { clearDraft, getHubUrl, loadDraft, saveDraft, setHubUrl } from "./lib/draft-store";

type ConnectionState = "checking" | "online" | "offline";

export default function App() {
  const [hubUrl, setHubUrlState] = useState("http://192.168.1.10:3737");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [bootstrap, setBootstrap] = useState<HubBootstrap | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [captainId, setCaptainId] = useState("waiter-1");
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);

  const client = useMemo(() => new HubClient(hubUrl), [hubUrl]);
  const selectedTable = bootstrap?.tables.find((table) => table.id === selectedTableId) ?? null;

  useEffect(() => {
    void getHubUrl().then((url) => {
      setHubUrlState(url);
    });
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(interval);
  }, [client]);

  async function refresh() {
    setConnection("checking");
    const isOnline = await client.health();
    setConnection(isOnline ? "online" : "offline");
    if (!isOnline) return;
    setBootstrap(await client.bootstrap());
  }

  async function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    const draft = await loadDraft(tableId);
    if (draft) {
      setCaptainId(draft.captainId);
      setPax(String(draft.pax));
      setItems(draft.items);
      return;
    }

    if (connection === "online") {
      const order = await client.tableOrder(tableId);
      setItems(
        (order?.items ?? [])
          .filter((item) => item.status !== "cancelled")
          .map((item) => ({
            menuItemId: item.menu_item_id,
            quantity: item.quantity,
            notes: item.notes
          }))
      );
      if (order?.order?.pax) setPax(String(order.order.pax));
    } else {
      setItems([]);
    }
  }

  async function persistDraft(nextItems = items) {
    if (!selectedTableId) return;
    await saveDraft({
      tableId: selectedTableId,
      captainId,
      pax: Number(pax || 1),
      items: nextItems,
      updatedAt: new Date().toISOString()
    });
  }

  function addItem(menuItemId: string) {
    const current = items.find((item) => item.menuItemId === menuItemId && !item.notes);
    const next = current
      ? items.map((item) =>
          item.menuItemId === menuItemId && !item.notes ? { ...item, quantity: item.quantity + 1 } : item
        )
      : [...items, { menuItemId, quantity: 1 }];
    setItems(next);
    void persistDraft(next);
  }

  function changeQty(menuItemId: string, delta: number) {
    const next = items
      .map((item) => (item.menuItemId === menuItemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
      .filter((item) => item.quantity > 0);
    setItems(next);
    void persistDraft(next);
  }

  async function submitOrder() {
    if (!selectedTableId || items.length === 0) return;
    if (connection !== "online") {
      await persistDraft();
      Alert.alert("Saved locally", "Reconnect to the hub to send KOT.");
      return;
    }

    await client.submitOrder({
      tableId: selectedTableId,
      captainId,
      pax: Number(pax || 1),
      orderType: "dine_in",
      items
    });
    await clearDraft(selectedTableId);
    await refresh();
    Alert.alert("KOT sent", "Kitchen and cashier are updated.");
  }

  async function saveHub() {
    await setHubUrl(hubUrl);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Waiter Station</Text>
          <Text style={styles.muted}>{connection === "online" ? "Hub online" : "Offline draft mode"}</Text>
        </View>
        {connection === "checking" ? <ActivityIndicator /> : <View style={[styles.dot, styles[connection]]} />}
      </View>

      <View style={styles.hubRow}>
        <TextInput value={hubUrl} onChangeText={setHubUrlState} style={styles.hubInput} autoCapitalize="none" />
        <Pressable style={styles.primaryButton} onPress={saveHub}>
          <Text style={styles.primaryButtonText}>Set</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <FlatList
          data={bootstrap?.tables ?? []}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.tableList}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.tableTile, item.id === selectedTableId && styles.selectedTable]}
              onPress={() => void selectTable(item.id)}
            >
              <Text style={styles.tableName}>{item.name}</Text>
              <Text style={styles.muted}>{item.status}</Text>
            </Pressable>
          )}
        />

        <View style={styles.order}>
          <Text style={styles.sectionTitle}>{selectedTable ? `Table ${selectedTable.name}` : "Select table"}</Text>
          <View style={styles.inputs}>
            <TextInput value={captainId} onChangeText={setCaptainId} style={styles.input} />
            <TextInput value={pax} onChangeText={setPax} keyboardType="numeric" style={styles.paxInput} />
          </View>

          <ScrollView style={styles.menu}>
            {(bootstrap?.menuItems ?? [])
              .filter((item) => item.active)
              .map((menuItem) => (
                <Pressable key={menuItem.id} style={styles.menuItem} onPress={() => addItem(menuItem.id)}>
                  <View>
                    <Text style={styles.menuName}>{menuItem.name}</Text>
                    <Text style={styles.muted}>{menuItem.production_unit_name}</Text>
                  </View>
                  <Text style={styles.price}>₹{(menuItem.price_paise / 100).toFixed(0)}</Text>
                </Pressable>
              ))}
          </ScrollView>

          <View style={styles.ticket}>
            {items.map((item) => {
              const menuItem = bootstrap?.menuItems.find((entry) => entry.id === item.menuItemId);
              return (
                <View key={item.menuItemId} style={styles.ticketLine}>
                  <Text style={styles.ticketName}>{menuItem?.name ?? item.menuItemId}</Text>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyButton} onPress={() => changeQty(item.menuItemId, -1)}>
                      <Text>-</Text>
                    </Pressable>
                    <Text>{item.quantity}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => changeQty(item.menuItemId, 1)}>
                      <Text>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable style={styles.primaryButton} onPress={() => void submitOrder()}>
            <Text style={styles.primaryButtonText}>{connection === "online" ? "Send KOT" : "Save Draft"}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f1ed" },
  header: {
    padding: 16,
    backgroundColor: "#fffdfa",
    borderBottomWidth: 1,
    borderColor: "#ded8ce",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1d1b18" },
  muted: { color: "#716a60", fontSize: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  online: { backgroundColor: "#2c6f68" },
  offline: { backgroundColor: "#a6422b" },
  checking: { backgroundColor: "#9b8a64" },
  hubRow: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#fffdfa" },
  hubInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#cfc8bb",
    borderRadius: 6,
    paddingHorizontal: 10,
    color: "#1d1b18"
  },
  body: { flex: 1, flexDirection: "row" },
  tableList: { padding: 10 },
  tableTile: {
    width: 112,
    minHeight: 86,
    margin: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ded8ce",
    borderRadius: 8,
    backgroundColor: "#fffdfa",
    justifyContent: "space-between"
  },
  selectedTable: { borderColor: "#2c6f68", borderWidth: 3 },
  tableName: { fontSize: 19, fontWeight: "700", color: "#1d1b18" },
  order: { flex: 1, padding: 12, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1d1b18" },
  inputs: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cfc8bb",
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fffdfa"
  },
  paxInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#cfc8bb",
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fffdfa"
  },
  menu: { maxHeight: 280 },
  menuItem: {
    minHeight: 58,
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ebe5da",
    backgroundColor: "#fffdfa",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  menuName: { fontSize: 15, fontWeight: "600", color: "#1d1b18" },
  price: { color: "#2c6f68", fontWeight: "700" },
  ticket: { flex: 1, gap: 8 },
  ticketLine: {
    minHeight: 44,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ebe5da",
    backgroundColor: "#fffdfa",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  ticketName: { flex: 1, color: "#1d1b18", fontWeight: "600" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyButton: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cfc8bb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdfa"
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 6,
    backgroundColor: "#25221e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryButtonText: { color: "#fffdfa", fontWeight: "700" }
});
