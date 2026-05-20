import type { KotType, PrintLayoutSettingsInput } from "@gaurav-pos/shared";
import type { HubOrm } from "../../db/database.js";
import { kotItems, kots } from "../../db/drizzle-schema.js";
import { makeId } from "../ids.js";
import { renderKotTicketForPrint, type KotTicketItem } from "../tickets.js";
import type { KotItemChange, OrderRow, TableRow, TicketCreationResult } from "./types.js";

interface PrintJobInput {
  targetType: "KOT" | "BOT" | "BILL";
  targetId: string;
  productionUnitId: string | null;
  printerHost: string | null;
  printerPort: number | null;
  printerName: string | null;
  payload: string;
}

export function createKotsForChanges(input: {
  orm: HubOrm;
  order: OrderRow;
  table: TableRow;
  changes: KotItemChange[];
  now: string;
  isNewOrder: boolean;
  forceCancelled: boolean;
  reason?: string;
  typeOverride?: KotType;
  sequenceOrderId?: string;
  printTickets?: boolean;
  note?: string;
  sequenceForKotGroup: (orderId: string, productionUnitId: string, ticketLabel: "KOT" | "BOT") => number;
  getPrintLayout: (scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string) => PrintLayoutSettingsInput;
  enqueuePrintJob: (job: PrintJobInput) => string;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => void;
}): TicketCreationResult {
  const {
    orm,
    order,
    table,
    changes,
    now,
    isNewOrder,
    forceCancelled,
    reason,
    typeOverride,
    sequenceOrderId,
    printTickets = true,
    note,
    sequenceForKotGroup,
    getPrintLayout,
    enqueuePrintJob,
    appendEvent
  } = input;
  const meaningfulChanges = changes.filter((change) => (change.quantityDelta !== 0 || change.noteChanged) && change.productionUnitId);
  if (meaningfulChanges.length === 0) return { kotIds: [], printJobIds: [] };

  const grouped = new Map<string, KotItemChange[]>();
  for (const change of meaningfulChanges) {
    const type: KotType = typeOverride ?? (forceCancelled
      ? "cancelled"
      : change.quantityDelta > 0 && isNewOrder
        ? "new"
        : change.quantityDelta >= 0
          ? "modified"
          : "partial_cancel");
    const key = `${change.productionUnitId}:${type}:${change.ticketLabel}`;
    grouped.set(key, [...(grouped.get(key) ?? []), change]);
  }

  const kotIds: string[] = [];
  const printJobIds: string[] = [];
  for (const [key, items] of grouped) {
    const [productionUnitId, type, ticketLabel] = key.split(":") as [string, KotType, "KOT" | "BOT"];
    const firstItem = items[0];
    if (!firstItem) continue;

    const kotId = makeId("kot");
    const sequence = sequenceForKotGroup(sequenceOrderId ?? order.id, productionUnitId, ticketLabel);
    orm
      .insert(kots)
      .values({
        id: kotId,
        orderId: order.id,
        productionUnitId,
        type,
        status: "queued",
        sequence,
        ticketLabel,
        reason: reason ?? null,
        note: note?.trim() || null,
        createdAt: now
      })
      .run();

    const ticketItems: KotTicketItem[] = [];
    for (const item of items) {
      const kotItemId = makeId("kotitem");
      orm
        .insert(kotItems)
        .values({
          id: kotItemId,
          kotId,
          orderItemId: item.orderItemId,
          menuItemId: item.menuItemId,
          nameSnapshot: item.name,
          quantityDelta: item.quantityDelta,
          noteSnapshot: item.note?.trim() || null
        })
        .run();
      ticketItems.push({ name: item.name, quantityDelta: item.quantityDelta, note: item.note });
    }

    const template = getPrintLayout("unit", productionUnitId);
    const payload = renderKotTicketForPrint({
      sequence,
      type,
      tableName: table.name,
      productionUnitName: firstItem.productionUnitName,
      captainId: order.captain_id,
      createdAt: now,
      reason,
      note,
      items: ticketItems,
      ticketLabel,
      lineWidthChars: template.lineWidthChars,
      headerAlign: template.headerAlign,
      footerAlign: template.footerAlign,
      sectionStyles: template.sectionStyles,
      topPaddingLines: template.topPaddingLines,
      feedLines: template.feedLines,
      showTable: template.showTable,
      showCaptain: template.showCaptain,
      showDateTime: template.showDateTime,
      header: template.kotHeader,
      footer: template.kotFooter
    });

    if (printTickets) {
      const printJobId = enqueuePrintJob({
        targetType: ticketLabel,
        targetId: kotId,
        productionUnitId,
        printerHost: firstItem.printerHost,
        printerPort: firstItem.printerPort,
        printerName: firstItem.printerName,
        payload
      });
      printJobIds.push(printJobId);
    }

    appendEvent("kot.created", "kot", kotId, {
      orderId: order.id,
      productionUnitId,
      type,
      sequence,
      ticketLabel
    });
    kotIds.push(kotId);
  }

  return { kotIds, printJobIds };
}
