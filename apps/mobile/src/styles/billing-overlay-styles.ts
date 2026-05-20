import { Platform } from "react-native";

import { androidStatusBarTopInset, palette } from "./app-style-tokens";

export const billingOverlayStyles = {
  billingPanel: {
    borderColor: palette.greenBold,
    backgroundColor: palette.greenSoft,
    gap: 12
  },
  billingStack: { gap: 12 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryBox: {
    minWidth: 140,
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.lineSoft,
    backgroundColor: palette.white,
    padding: 10,
    gap: 3
  },
  summaryValue: { color: palette.ink, fontWeight: "900", fontSize: 17 },
  billTotals: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.wash,
    padding: 10,
    gap: 4
  },
  historyScreenPanel: { gap: 14 },
  historyBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden"
  },
  historyDayChips: {
    gap: 8,
    paddingVertical: 2
  },
  historyRow: {
    minHeight: 96,
    borderBottomWidth: 1,
    borderColor: palette.lineSoft,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  historyRowHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  historyBillTitle: { color: palette.ink, fontSize: 16, fontWeight: "900", lineHeight: 21 },
  historyAmount: { color: palette.greenBold, fontSize: 16, fontWeight: "900", lineHeight: 21 },
  historyMeta: { color: palette.ink, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  historyModifiedTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.blueBillSoft,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    color: palette.blueBill,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyActionStack: { gap: 8, alignItems: "stretch" },
  historyItemLines: { gap: 2, paddingVertical: 2 },
  historyPrintButton: {
    minHeight: 42,
    paddingHorizontal: 12
  },
  itemNoteInput: {
    marginTop: 8,
    minHeight: 40,
    fontSize: 13,
    flexBasis: "100%"
  },
  itemNoteButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.wash,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  itemNoteButtonText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  historyEditStack: { gap: 10, paddingBottom: 6 },
  historyEditLine: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  historyVariantActions: { gap: 8, alignItems: "center" },
  segmentedRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden"
  },
  segmentButton: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", backgroundColor: palette.paper },
  segmentButtonActive: { backgroundColor: palette.ink },
  segmentText: { color: palette.ink, fontWeight: "800" },
  segmentTextActive: { color: palette.inverseText },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  moneyInputWrap: { minWidth: 126, flex: 1, gap: 5 },
  quickPayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickPayButton: {
    minHeight: 50,
    minWidth: 112,
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.green,
    backgroundColor: palette.greenSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  quickPayText: { color: palette.greenBold, fontWeight: "900", fontSize: 14 },
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(21,19,15,0.5)",
    padding: 18,
    justifyContent: "center"
  },
  popupCard: {
    maxHeight: "86%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    padding: 14,
    gap: 12
  },
  popupScroll: { maxHeight: 460 },
  dangerButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexGrow: 1
  },
  dangerButtonText: { color: palette.inverseText, fontWeight: "800" },
  dangerText: { color: palette.red, fontWeight: "900" },
  sendButton: { flex: 1, minHeight: 48 },
  buttonDisabled: { opacity: 0.45 },
  draftBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: Platform.OS === "android" ? 14 : 24,
    minHeight: 74,
    borderRadius: 8,
    backgroundColor: palette.ink,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: palette.shadowStrong,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    shadowOpacity: 1,
    elevation: 8
  },
  draftBarBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.green,
    alignItems: "center" as const,
    justifyContent: "center" as const
  },
  draftBarBadgeText: { color: palette.inverseText, fontSize: 13, fontWeight: "900" },
  draftBarMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  draftBarText: { flex: 1 },
  draftBarTitle: { color: palette.inverseText, fontWeight: "900", fontSize: 17 },
  draftBarMeta: { color: palette.inverseMuted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  draftBarButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22
  },
  draftBarButtonText: { color: palette.ink, fontWeight: "900", fontSize: 15 },
  empty: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 6
  },
  emptyCompact: { minHeight: 78, alignItems: "flex-start" },
  emptyTitle: { color: palette.ink, fontWeight: "900", fontSize: 15 },
  scannerShell: { flex: 1, backgroundColor: palette.scanner, paddingTop: androidStatusBarTopInset },
  scannerHeader: {
    padding: 16,
    backgroundColor: palette.paper,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  camera: { flex: 1 },
  collapsibleWrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    overflow: "hidden" as const
  },
  collapsibleHeader: {
    minHeight: 52,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: palette.paper,
    gap: 10
  },
  collapsibleHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  collapsibleTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  collapsibleChevron: { color: palette.muted, fontSize: 16, fontWeight: "800" },
  collapsibleBody: { padding: 14, gap: 10 },
  kotStartButton: {
    backgroundColor: palette.amberSoft,
    borderWidth: 1,
    borderColor: palette.amber
  },
  kotStartButtonText: { color: palette.amberBold, fontWeight: "900" }
} as const;
