import { StyleSheet } from "react-native";

import { palette } from "./app-style-tokens";

/** Connection settings sections and the shared brand mark. Sections are separated by rules, not nested cards. */
export const settingsStyles = StyleSheet.create({
  brandMark: {
    overflow: "hidden",
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.lineSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  brandMarkLogo: { width: "86%", height: "86%" },
  brandMarkDefault: { width: "100%", height: "100%" },
  // Each settings group is one white card on the paper page, matching service screens.
  section: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line
  },
  sectionHead: { gap: 2 },
  brandEditorRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  brandEditorActions: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 2 },
  smallButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.paper,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  smallButtonText: { color: palette.ink, fontWeight: "700", fontSize: 14 },
  textButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 2 },
  textButtonDanger: { color: palette.red, fontWeight: "600", fontSize: 14 },
  approvalBlock: { gap: 10 },
  successText: { color: palette.success, fontSize: 13, lineHeight: 19 },
  updateStatusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  updateHeadline: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: palette.lineSoft, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: palette.green },
  connectedSummary: { flexDirection: "row", alignItems: "center", gap: 14 },
  connectedText: { flex: 1, minWidth: 0, gap: 2 },
  connectedName: { color: palette.ink, fontSize: 19, lineHeight: 25, fontWeight: "600", letterSpacing: -0.3 }
});
