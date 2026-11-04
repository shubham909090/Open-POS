import { Platform } from "react-native";

import { palette, tabularFigures } from "./app-style-tokens";

export const billingOverlayStyles = {
  billingPanel: {
    borderColor: palette.line,
    backgroundColor: palette.paper,
    gap: 12
  },
  billingStack: { gap: 12 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryBox: { minWidth: 100, flex: 1, paddingVertical: 8, gap: 4 },
  summaryValue: { color: palette.ink, fontWeight: "600", fontSize: 16, fontVariant: tabularFigures },
  billTotals: { gap: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.lineSoft },
  billAmountRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  billAdjustmentToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: palette.lineSoft },
  // History is a full screen, so it sits directly on the page instead of inside a panel.
  historyScreenPanel: { gap: 14, borderWidth: 0, backgroundColor: "transparent", padding: 0 },
  historyBox: { backgroundColor: palette.paper },
  historyEmpty: { padding: 14 },
  historyDayChips: {
    gap: 6,
    paddingVertical: 2
  },
  historyDayChip: { minHeight: 36, paddingHorizontal: 14 },
  historyToolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyRow: {
    borderBottomWidth: 1,
    borderColor: palette.lineSoft,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 2
  },
  historyRowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  historyTitleGroup: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  historyItemsLine: { color: palette.inkSoft, fontSize: 13, lineHeight: 18 },
  historyBillTitle: { color: palette.ink, fontSize: 15, fontWeight: "700", lineHeight: 20 },
  historyAmount: { color: palette.ink, fontSize: 17, fontWeight: "800", lineHeight: 21, fontVariant: tabularFigures },
  historyMeta: { color: palette.muted, fontSize: 12, fontWeight: "400", lineHeight: 18 },
  historyTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 2 },
  historyStatusTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 0,
    overflow: "hidden",
    backgroundColor: palette.softWash,
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyStatusPaid: { backgroundColor: palette.successSoft, color: palette.success },
  // Pending = bill printed, waiting for money: indigo, same as billed tables.
  historyStatusPending: { backgroundColor: palette.blueBillSoft, color: palette.blueBill },
  historyStatusVoid: { backgroundColor: palette.redSoft, color: palette.red },
  // Neutral: blue is reserved for "bill printed" table state.
  historyModifiedTag: {
    alignSelf: "flex-start",
    borderRadius: 5,
    backgroundColor: palette.wash,
    borderWidth: 1,
    borderColor: palette.line,
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  historyActionStack: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  historyFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  historyPaymentRow: { gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.lineSoft },
  historyItemLines: { gap: 2, paddingVertical: 2 },
  historyPrintButton: {
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 9
  },
  itemNoteInput: {
    marginTop: 8,
    minHeight: 48,
    fontSize: 13,
    flexBasis: "100%"
  },
  itemNoteButton: { alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingHorizontal: 0 },
  itemNoteButtonText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  historyEditStack: { gap: 10, paddingBottom: 6 },
  historyEditActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyEditActionButton: { flexGrow: 1, minWidth: 132 },
  historyEditLine: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderColor: palette.line,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  historyVariantActions: { gap: 8, alignItems: "center" },
  segmentedRow: {
    flexDirection: "row",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden"
  },
  segmentButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: palette.paper },
  segmentButtonActive: { backgroundColor: palette.chrome },
  segmentText: { color: palette.ink, fontWeight: "600" },
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
    minWidth: 64,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.paper,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  quickPayButtonWide: { flexBasis: "45%", flexShrink: 0 },
  quickPaySelected: { borderColor: palette.success, backgroundColor: palette.successSoft },
  quickPayText: { color: palette.ink, fontWeight: "700", fontSize: 14 },
  // Generating a bill moves the table to "waiting for money": indigo, like billed tables.
  generateBillButton: { backgroundColor: palette.blueBill },
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(24,24,27,0.32)",
    padding: 18,
    justifyContent: "center"
  },
  popupCard: {
    maxHeight: "90%",
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexGrow: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    padding: 20,
    gap: 16
  },
  popupScroll: { maxHeight: 460 },
  dangerButton: {
    minHeight: 48,
    borderRadius: 6,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexGrow: 1
  },
  dangerButtonText: { color: palette.inverseText, fontWeight: "600" },
  dangerText: { color: palette.red, fontWeight: "600" },
  sendButton: { flex: 1, minHeight: 48 },
  buttonDisabled: { opacity: 0.45 },
  // A primary action waiting for input (no target, no PIN yet) reads neutral grey, not a faded brand colour.
  primaryButtonWaiting: { backgroundColor: palette.faint, borderColor: palette.faint, opacity: 1, elevation: 0, shadowOpacity: 0 },
  draftBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 76,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: palette.chrome,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: palette.shadowStrong,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 8,
    shadowOpacity: 0.3,
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
  draftBarBadgeText: { color: palette.inverseText, fontSize: 13, fontWeight: "600" },
  draftBarMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  draftBarText: { flex: 1 },
  draftBarTitle: { color: palette.chromeText, fontWeight: "700", fontSize: 15, fontVariant: tabularFigures },
  draftBarMeta: { color: palette.inverseMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  draftBarButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  draftBarButtonText: { color: palette.inverseText, fontWeight: "700", fontSize: 15 },
  empty: {
    minHeight: 120,
    borderRadius: 6,
    borderWidth: 0,
    borderColor: palette.line,
    backgroundColor: palette.wash,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 6
  },
  emptyCompact: { minHeight: 0, alignItems: "flex-start", backgroundColor: "transparent", padding: 0, gap: 2 },
  emptyTitle: { color: palette.ink, fontWeight: "600", fontSize: 15 },
  scannerShell: { flex: 1, backgroundColor: palette.scanner },
  scannerHeader: {
    padding: 16,
    backgroundColor: palette.paper,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  camera: { flex: 1 },
  scannerGuide: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingHorizontal: 28 },
  scannerFrame: { width: "85%", maxWidth: 300, aspectRatio: 1, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 12 },
  scannerHint: { color: palette.inverseText, fontSize: 14, lineHeight: 21, textAlign: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
  collapsibleWrap: { backgroundColor: palette.paper, borderRadius: 0, borderBottomWidth: 1, borderColor: palette.line, overflow: "hidden" },
  collapsibleHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  collapsibleHeaderExpanded: { borderBottomWidth: 0 },
  collapsibleTitle: { color: palette.ink, fontSize: 15, fontWeight: "600" },
  collapsibleChevron: { color: palette.muted, fontSize: 20, fontWeight: "400" },
  collapsibleBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  kotStartButton: {
    backgroundColor: palette.amberSoft,
    borderWidth: 1,
    borderColor: palette.amber
  },
  kotStartButtonText: { color: palette.amberBold, fontWeight: "600" }
} as const;
