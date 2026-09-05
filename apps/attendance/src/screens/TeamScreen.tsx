import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Archive, ChevronRight, Plus, Search, Users, X } from "lucide-react-native";
import type { AttendanceEmployee, EmployeeInput } from "../types";
import { colors, font, shadow } from "../theme";
import { formatRupees, initials } from "../utils";
import { EmployeeFormModal } from "../components/EmployeeFormModal";
import { EmptyState, SectionLabel } from "../components/ui";

type Props = {
  employees: AttendanceEmployee[];
  saving: boolean;
  onAdd: (input: EmployeeInput) => Promise<void>;
  onOpen: (employee: AttendanceEmployee) => void;
  asOfDate: string;
};

export function TeamScreen({ employees, saving, onAdd, onOpen, asOfDate }: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => employees.filter((employee) => {
    if (!!employee.archivedAt !== showArchived) return false;
    return !normalized || `${employee.name} ${employee.role}`.toLowerCase().includes(normalized);
  }), [employees, normalized, showArchived]);
  const activeCount = employees.filter((employee) => !employee.archivedAt).length;
  const archivedCount = employees.length - activeCount;

  return (
    <View style={styles.fill}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.heroRow}>
              <View>
                <SectionLabel>People</SectionLabel>
                <Text style={styles.hero}>{activeCount} active</Text>
              </View>
              <Pressable style={styles.add} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add team member" testID="add-employee"><Plus size={23} color={colors.white} /></Pressable>
            </View>
            <View style={styles.search}>
              <Search size={19} color={colors.inkMuted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search name or role" placeholderTextColor="#8C938D" style={styles.searchInput} accessibilityLabel="Search team" testID="team-search" />
              {query ? <Pressable hitSlop={10} onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear search"><X size={18} color={colors.inkMuted} /></Pressable> : null}
            </View>
            <View style={styles.filters}>
              <Pressable onPress={() => setShowArchived(false)} accessibilityRole="tab" accessibilityState={{ selected: !showArchived }} accessibilityLabel="Show active team members" style={[styles.filter, !showArchived && styles.filterActive]}><Text style={[styles.filterText, !showArchived && styles.filterTextActive]}>Active · {activeCount}</Text></Pressable>
              <Pressable onPress={() => setShowArchived(true)} accessibilityRole="tab" accessibilityState={{ selected: showArchived }} accessibilityLabel="Show archived team members" style={[styles.filter, showArchived && styles.filterActive]}><Text style={[styles.filterText, showArchived && styles.filterTextActive]}>Archived · {archivedCount}</Text></Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            cssInterop={false}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name}, ${item.role}`}
            testID={`employee-${item.id}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={[styles.avatar, item.archivedAt && styles.avatarArchived]}><Text style={styles.avatarText}>{initials(item.name)}</Text></View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
              <Text numberOfLines={1} style={styles.role}>{item.role}</Text>
              <Text style={styles.salary}>{formatRupees(item.monthlySalaryPaise)} / month</Text>
            </View>
            {item.archivedAt ? <Archive size={18} color={colors.inkMuted} /> : <ChevronRight size={20} color={colors.inkMuted} />}
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<EmptyState icon={showArchived ? Archive : Users} title={query ? "No matching team member" : showArchived ? "No archived team members" : "Build your team"} body={query ? "Try a different name or role." : showArchived ? "Archived team members will appear here." : "Add your first team member to start taking attendance."} />}
      />
      <EmployeeFormModal visible={adding} saving={saving} defaultJoiningDate={asOfDate} onClose={() => setAdding(false)} onSave={onAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 18, paddingBottom: 32 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 18 },
  hero: { color: colors.ink, fontFamily: font.display, fontSize: 31, marginTop: 3 },
  add: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", ...shadow },
  search: { minHeight: 52, borderRadius: 17, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.ink, fontFamily: font.body, fontSize: 15, paddingVertical: 0 },
  filters: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 20 },
  filter: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  filterActive: { backgroundColor: colors.forestSoft, borderColor: colors.forestSoft },
  filterText: { color: colors.inkMuted, fontFamily: font.medium, fontSize: 12 },
  filterTextActive: { color: colors.forest },
  card: { minHeight: 94, borderRadius: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.forestSoft, alignItems: "center", justifyContent: "center" },
  avatarArchived: { backgroundColor: "#E5E3DD" },
  avatarText: { color: colors.forest, fontFamily: font.medium, fontSize: 15 },
  copy: { flex: 1 },
  name: { color: colors.ink, fontFamily: font.medium, fontSize: 16 },
  role: { color: colors.inkMuted, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  salary: { color: colors.ink, fontFamily: font.body, fontSize: 11, marginTop: 7 },
  pressed: { opacity: 0.66 },
});
