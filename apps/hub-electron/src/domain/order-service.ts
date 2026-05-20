import {
  type AdjustAlcoholStockInput,
  type BillAdjustmentInput,
  type BillPrinterSlot,
  type CancelOrderInput,
  type CancelOrderItemsInput,
  type CreateAlcoholItemInput,
  type CreateFloorInput,
  type CreateMenuItemInput,
  type CreateProductionUnitInput,
  type CreateSaleGroupInput,
  type CreateTableInput,
  type DomainEvent,
  type HistoryEditBillInput,
  type HubConnectionSettingsInput,
  type KotType,
  type ManagerApprovalInput,
  type ManagerPinInput,
  type MarkNcBillInput,
  type MasterApprovalInput,
  type MoveOrderItemsInput,
  type MoveTableInput,
  type PrintLayoutSettingsInput,
  type PrinterOutputMode,
  type ReportRangeQueryInput,
  type ReprintBillInput,
  type ReprintKotInput,
  type ReviseBillInput,
  type RetryPrintJobInput,
  type SetMasterPinInput,
  type SettleBillInput,
  type SubmitOrderInput,
  type TicketTemplateInput,
  type UpdateAlcoholItemInput,
  type UpdateFloorInput,
  type UpdateKotStatusInput,
  type UpdateMenuItemInput,
  type UpdateOrderStateInput,
  type UpdateProductionUnitInput,
  type UpdateBillPrintersInput,
  type UpdateReceiptPrinterInput,
  type UpdateSaleGroupInput,
  type UpdateTableInput
} from "@gaurav-pos/shared";
import type { HubOrm, SqliteDatabase } from "../db/database.js";
import {
  assertAlcoholHasSellableVariant as assertAlcoholHasSellableVariantModel,
  assertAlcoholRecipeMatchesType as assertAlcoholRecipeMatchesTypeModel,
  assertAlcoholVariantsMatchType as assertAlcoholVariantsMatchTypeModel,
  countAlcoholRecipeSnapshotUsage as countAlcoholRecipeSnapshotUsageModel,
  defaultAlcoholProductionUnitId as defaultAlcoholProductionUnitIdModel,
  isAlcoholMenuItem as isAlcoholMenuItemModel,
  parseAlcoholRecipeCsv as parseAlcoholRecipeCsvModel,
  replaceAlcoholRecipe as replaceAlcoholRecipeModel,
  replaceAlcoholVariants as replaceAlcoholVariantsModel,
  resolvePlainLiquorRef as resolvePlainLiquorRefModel,
  snapshotAlcoholRecipe as snapshotAlcoholRecipeModel
} from "./order-service/alcohol-catalog.js";
import {
  recordAlcoholMovement as recordAlcoholMovementModel,
  requireAlcoholStock as requireAlcoholStockModel,
  writeAlcoholStock as writeAlcoholStockModel
} from "./order-service/alcohol-stock.js";
import {
  applyAlcoholUsageDeltaForHistoryEdit as applyAlcoholUsageDeltaForHistoryEditModel,
  calculatePendingAlcoholUsage as calculatePendingAlcoholUsageModel,
  deductAlcoholStockForPaidBill as deductAlcoholStockForPaidBillModel
} from "./order-service/alcohol-stock-consumption.js";
import {
  adjustAlcoholStock as adjustAlcoholStockModel,
  createAlcoholItem as createAlcoholItemModel,
  importAlcoholItemsFromCsv as importAlcoholItemsFromCsvModel,
  listAlcoholCatalog as listAlcoholCatalogModel,
  listAlcoholStockMovements as listAlcoholStockMovementsModel,
  listAlcoholStorage as listAlcoholStorageModel,
  updateAlcoholItem as updateAlcoholItemModel,
  type AlcoholActionContext
} from "./order-service/alcohol-actions.js";
import type { AlcoholUsage } from "./order-service/alcohol-usage.js";
import { removeEmptyPendingBills as removeEmptyPendingBillsModel, type BillCleanupContext } from "./order-service/bill-cleanup.js";
import { getBillById, getLatestBillForOrder } from "./order-service/bill-queries.js";
import { recordBillRevision as recordBillRevisionModel } from "./order-service/bill-revisions.js";
import { buildBillTicket as buildBillTicketModel } from "./order-service/bill-ticket-model.js";
import { calculateBillTotals as calculateBillTotalsModel } from "./order-service/bill-totals.js";
import {
  applyBillAdjustments as applyBillAdjustmentsModel,
  deleteLocalBillRecord as deleteLocalBillRecordModel,
  getBillPaidPaise as getBillPaidPaiseModel,
  replaceHistoryEditPayments as replaceHistoryEditPaymentsModel,
  syncPaidBillPaymentToFinalTotal as syncPaidBillPaymentToFinalTotalModel
} from "./order-service/bill-payment-records.js";
import {
  editHistoryBill as editHistoryBillModel,
  markBillNc as markBillNcModel,
  printBill as printBillModel,
  reprintBill as reprintBillModel,
  reprintBillFromHistory as reprintBillFromHistoryModel,
  reviseBill as reviseBillModel,
  type BillActionContext
} from "./order-service/bill-actions.js";
import {
  generateBill as generateBillModel,
  settleBill as settleBillModel,
  type BillLifecycleContext
} from "./order-service/bill-lifecycle.js";
import {
  ensureCurrentBusinessDay as ensureCurrentBusinessDayModel,
  finalizeCompletedBusinessDays as finalizeCompletedBusinessDayModels,
  getBusinessDayById as getBusinessDayByIdModel,
  refreshDailyReportSnapshot as refreshDailyReportSnapshotModel
} from "./order-service/business-day-lifecycle.js";
import { verifyApproval } from "./order-service/approvals.js";
import {
  listFloorReadModels,
  listTableReadModels,
  requireTable as requireTableModel
} from "./order-service/floor-table-catalog.js";
import {
  findMenuItemIdByName as findMenuItemIdByNameModel,
  getCurrentMenuPopularity as getCurrentMenuPopularityModel,
  getMenuItemsByIds,
  listMenuItemReadModels,
  listVariantsForMenuItems as listVariantModelsForMenuItems,
  resolveMenuItemVariant as resolveMenuItemVariantModel
} from "./order-service/menu-catalog.js";
import {
  bulkRemoveMenuItems as bulkRemoveMenuItemsModel,
  createMenuItem as createMenuItemModel,
  importMenuItemsFromCsv as importMenuItemsFromCsvModel,
  removeMenuItem as removeMenuItemModel,
  removeMenuItemWithApproval as removeMenuItemWithApprovalModel,
  setMenuItemActive as setMenuItemActiveModel,
  updateMenuItem as updateMenuItemModel,
  type MenuItemActionContext
} from "./order-service/menu-item-actions.js";
import {
  getOpenOrderItemByName,
  getOrderItemById,
  getOrderItemByMenuKey,
  listOrderItems
} from "./order-service/order-item-queries.js";
import {
  applyOrderItemDiff as applyOrderItemDiffModel,
  buildOrderItemKey,
  kotChangeFromOrderItem as kotChangeFromOrderItemModel
} from "./order-service/order-item-diff.js";
import {
  cancelOrder as cancelOrderModel,
  cancelOrderItems as cancelOrderItemsModel,
  submitOrder as submitOrderModel,
  type OrderLifecycleContext
} from "./order-service/order-lifecycle.js";
import {
  assertCanMoveOrder as assertCanMoveOrderModel,
  createOrder as createOrderRecord,
  freeTable as freeTableRecord,
  requireEditableOrder as requireEditableOrderRecord,
  requireOrderById as requireOrderByIdRecord,
  selectOrderById as selectOrderByIdRecord
} from "./order-service/order-records.js";
import {
  updateOrderState as updateOrderStateModel,
  type OrderStateUpdateContext
} from "./order-service/order-state-update.js";
import { appendDomainEvent } from "./order-service/event-log.js";
import { createKotsForChanges as createKotsForChangesModel } from "./order-service/kot-creation.js";
import {
  enqueueTestBillPrint as enqueueTestBillPrintModel,
  enqueueTestKotPrint as enqueueTestKotPrintModel,
  ensurePrinterOutputMode as ensurePrinterOutputModeModel,
  getBillPrinterProfile as getBillPrinterProfileModel,
  getBillPrinters as getBillPrintersModel,
  getPrinterOutputMode as getPrinterOutputModeModel,
  getReceiptPrinter as getReceiptPrinterModel,
  resolveBillPrinter as resolveBillPrinterModel,
  updateBillPrinters as updateBillPrintersModel,
  updatePrinterOutputMode as updatePrinterOutputModeModel,
  updateReceiptPrinter as updateReceiptPrinterModel,
  type PrintSettingsActionContext
} from "./order-service/print-settings-actions.js";
import {
  enqueuePrintJob as enqueuePrintJobRecord,
  retryPrintJob as retryPrintJobRecord,
  type PrintJobInput
} from "./order-service/print-job-records.js";
import {
  getProductionUnit,
  getProductionUnitsByIds,
  listProductionUnitReadModels,
  resolveProductionUnitRef as resolveProductionUnitRefModel,
  requireProductionUnit as requireProductionUnitQuery
} from "./order-service/production-unit-queries.js";
import { updateKotStatus as updateKotStatusModel } from "./order-service/kot-status.js";
import {
  createReadyNotification as createReadyNotificationModel,
  listReadyNotifications as listReadyNotificationModels
} from "./order-service/ready-notifications.js";
import {
  enqueueBillReprint as enqueueBillReprintModel,
  enqueueKotReprint as enqueueKotReprintModel
} from "./order-service/reprint-tickets.js";
import { buildRangeReport } from "./order-service/report-range.js";
import { getDailyReportSnapshot, listDailyReportSnapshots } from "./order-service/report-snapshots.js";
import { buildDaySummary } from "./order-service/report-summary.js";
import { getOrderReadModel, getSyncStatusReadModel, listKdsTickets, listPrintJobReadModels } from "./order-service/read-models.js";
import {
  listSaleGroupReadModels,
  requireSaleGroup as requireSaleGroupModel,
  resolveSaleGroupRef as resolveSaleGroupRefModel
} from "./order-service/sale-group-catalog.js";
import {
  createFloor as createFloorModel,
  createProductionUnit as createProductionUnitModel,
  createSaleGroup as createSaleGroupModel,
  createTable as createTableModel,
  removeFloor as removeFloorModel,
  removeProductionUnit as removeProductionUnitModel,
  removeTable as removeTableModel,
  updateFloor as updateFloorModel,
  updateProductionUnit as updateProductionUnitModel,
  updateSaleGroup as updateSaleGroupModel,
  updateTable as updateTableModel,
  type SetupCatalogActionContext
} from "./order-service/setup-catalog-actions.js";
import {
  ensureHubConnectionSettings as ensureHubConnectionSettingsModel,
  getHubConnectionRuntimeSettings as getHubConnectionRuntimeSettingsModel,
  getHubConnectionSettings as getHubConnectionSettingsModel,
  getPrintLayout as getPrintLayoutModel,
  getPrintLayouts as getPrintLayoutsModel,
  getTicketTemplate as getTicketTemplateModel,
  isManagerPinConfigured as isManagerPinConfiguredModel,
  isMasterPinConfigured as isMasterPinConfiguredModel,
  setManagerPin as setManagerPinModel,
  setMasterPin as setMasterPinModel,
  updateHubConnectionSettings as updateHubConnectionSettingsModel,
  updatePrintLayout as updatePrintLayoutModel,
  updateTicketTemplate as updateTicketTemplateModel,
  verifyManagerPinForSession as verifyManagerPinForSessionModel,
  type SettingsActionContext
} from "./order-service/settings-actions.js";
import {
  prepareSubmittedItems as prepareSubmittedItemsModel,
  type SubmittedItemContext
} from "./order-service/submitted-items.js";
import {
  nextBillNumber as nextBillNumberModel,
  nextKotSequence as nextKotSequenceModel,
  sequenceForKotGroup as sequenceForKotGroupModel
} from "./order-service/sequences.js";
import {
  readSetting as readSettingRecord,
  writeSetting as writeSettingRecord
} from "./order-service/settings-records.js";
import {
  moveOrderItems as moveOrderItemsModel,
  moveTable as moveTableModel,
  type TableTransferContext
} from "./order-service/table-transfer.js";
import {
  type BillPrinterProfile,
  type BillPrinterProfiles,
  type BillRow,
  type BillTotals,
  type BulkMenuDeleteInput,
  type BulkMenuDeleteKind,
  type BulkMenuDeleteResult,
  type BusinessDayRow,
  type CsvImportResult,
  type DeviceActor,
  type KotItemChange,
  type MenuItemRow,
  type MenuItemVariantRow,
  type OrderItemRow,
  type OrderRow,
  type RequestedOrderItem,
  type TableRow,
  type TicketCreationResult
} from "./order-service/types.js";

export class OrderService {
  constructor(private readonly orm: HubOrm) {}

  private get db(): SqliteDatabase {
    return this.orm.$client;
  }

  submitOrder(input: SubmitOrderInput, actor?: DeviceActor): { orderId: string; kotIds: string[]; printJobIds: string[] } {
    return submitOrderModel(this.orderLifecycleContext(), input, actor);
  }

  cancelOrder(orderId: string, input: CancelOrderInput): { orderId: string; kotIds: string[]; printJobIds: string[] } {
    return cancelOrderModel(this.orderLifecycleContext(), orderId, input);
  }

  cancelOrderItems(orderId: string, input: CancelOrderItemsInput): { orderId: string; kotIds: string[]; printJobIds: string[] } {
    return cancelOrderItemsModel(this.orderLifecycleContext(), orderId, input);
  }

  reprintKot(kotId: string, input: ReprintKotInput): { printJobId: string } {
    const run = this.db.transaction(() => {
      const printJobId = enqueueKotReprintModel({
        db: this.db,
        kotId,
        reason: input.reason,
        getPrintLayout: (scope, productionUnitId) => this.getPrintLayout(scope, productionUnitId),
        enqueuePrintJob: (job) => this.enqueuePrintJob(job)
      });
      this.appendEvent("kot.reprinted", "kot", kotId, { ...input, printJobId });
      return { printJobId };
    });

    return run();
  }

  reprintBill(billId: string, input: ReprintBillInput): { printJobId: string } {
    return reprintBillModel(this.billActionContext(), billId, input);
  }

  reprintBillFromHistory(billId: string, requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
    return reprintBillFromHistoryModel(this.billActionContext(), billId, requestedBy, printerSlot);
  }

  private enqueueBillReprint(billId: string, suffix: string, printerSlot: BillPrinterSlot = "default"): string {
    return enqueueBillReprintModel({
      orm: this.orm,
      db: this.db,
      billId,
      suffix,
      printerSlot,
      buildBillTicket: (ticketInput) => this.buildBillTicket(ticketInput),
      resolveBillPrinter: (slot) => this.resolveBillPrinter(slot),
      enqueuePrintJob: (job) => this.enqueuePrintJob(job)
    });
  }

  getCurrentBusinessDay(): BusinessDayRow {
    return this.ensureCurrentBusinessDay();
  }

  listSaleGroups(includeInactive = true): unknown[] {
    return listSaleGroupReadModels(this.db, includeInactive);
  }

  createSaleGroup(input: CreateSaleGroupInput): { id: string } {
    return createSaleGroupModel(this.setupCatalogActionContext(), input);
  }

  updateSaleGroup(id: string, input: UpdateSaleGroupInput): { id: string } {
    return updateSaleGroupModel(this.setupCatalogActionContext(), id, input);
  }

  setManagerPin(input: ManagerPinInput): { configured: boolean } {
    return setManagerPinModel(this.settingsActionContext(), input);
  }

  setMasterPin(input: SetMasterPinInput): { configured: boolean } {
    return setMasterPinModel(this.settingsActionContext(), input);
  }

  isManagerPinConfigured(): boolean {
    return isManagerPinConfiguredModel(this.settingsActionContext());
  }

  isMasterPinConfigured(): boolean {
    return isMasterPinConfiguredModel(this.settingsActionContext());
  }

  verifyManagerPinForSession(pin: string): void {
    verifyManagerPinForSessionModel(this.settingsActionContext(), pin);
  }

  getHubConnectionSettings(reveal = false): {
    configured: boolean;
    cloudUrl: string;
    installationId: string;
    syncSecret: string;
    hubPublicUrl: string;
  } {
    return getHubConnectionSettingsModel(this.settingsActionContext(), reveal);
  }

  getHubConnectionRuntimeSettings(): HubConnectionSettingsInput {
    return getHubConnectionRuntimeSettingsModel(this.settingsActionContext());
  }

  updateHubConnectionSettings(input: HubConnectionSettingsInput): { configured: boolean } {
    return updateHubConnectionSettingsModel(this.settingsActionContext(), input);
  }

  ensureHubConnectionSettings(input: HubConnectionSettingsInput): void {
    ensureHubConnectionSettingsModel(this.settingsActionContext(), input);
  }

  getTicketTemplate(): TicketTemplateInput {
    return getTicketTemplateModel(this.settingsActionContext());
  }

  updateTicketTemplate(input: TicketTemplateInput): TicketTemplateInput {
    return updateTicketTemplateModel(this.settingsActionContext(), input);
  }

  getPrintLayouts(): { default: PrintLayoutSettingsInput; receipt: PrintLayoutSettingsInput; units: Array<{ productionUnitId: string; name: string; layout: PrintLayoutSettingsInput }> } {
    return getPrintLayoutsModel(this.settingsActionContext());
  }

  getPrintLayout(scope: PrintLayoutSettingsInput["scope"], productionUnitId?: string): PrintLayoutSettingsInput {
    return getPrintLayoutModel(this.settingsActionContext(), scope, productionUnitId);
  }

  updatePrintLayout(input: PrintLayoutSettingsInput): PrintLayoutSettingsInput {
    return updatePrintLayoutModel(this.settingsActionContext(), input);
  }

  generateBill(orderId: string, printerSlot: BillPrinterSlot = "default", input: BillAdjustmentInput = {}): { billId: string; billNumber: number; totalPaise: number; finalTotalPaise: number; printJobId: string } {
    return generateBillModel(this.billLifecycleContext(), orderId, printerSlot, input);
  }

  updateOrderState(orderId: string, input: UpdateOrderStateInput): { orderId: string; status: string; totalPaise: number; kotIds: string[]; printJobIds: string[]; billId?: string; revisionNumber?: number } {
    return updateOrderStateModel(this.orderStateUpdateContext(), orderId, input);
  }

  settleBill(billId: string, input: SettleBillInput): {
    billId: string;
    status: string;
    paidPaise: number;
    remainingPaise: number;
    finalTotalPaise: number;
  } {
    return settleBillModel(this.billLifecycleContext(), billId, input);
  }

  listTables(): unknown[] {
    return listTableReadModels(this.db);
  }

  listKds(productionUnitId: string): unknown[] {
    return listKdsTickets(this.db, productionUnitId);
  }

  bootstrap(): unknown {
    this.finalizeCompletedBusinessDays();
    this.removeEmptyPendingBills();
    return {
      currentBusinessDay: this.ensureCurrentBusinessDay(),
      floors: this.listFloors(),
      tables: this.listTables(),
      productionUnits: this.listProductionUnits(),
      saleGroups: this.listSaleGroups(true),
      menuItems: this.listMenuItems(true),
      menuPopularity: this.getCurrentMenuPopularity(),
      ticketTemplate: this.getTicketTemplate(),
      printJobs: this.listPrintJobs(20),
      printerOutputMode: this.getPrinterOutputMode(),
      syncStatus: this.getSyncStatus()
    };
  }

  listFloors(): unknown[] {
    return listFloorReadModels(this.db);
  }

  createFloor(input: CreateFloorInput): { id: string } {
    return createFloorModel(this.setupCatalogActionContext(), input);
  }

  updateFloor(id: string, input: UpdateFloorInput): { id: string } {
    return updateFloorModel(this.setupCatalogActionContext(), id, input);
  }

  removeFloor(id: string): { id: string; deleted: boolean; active: boolean } {
    return removeFloorModel(this.setupCatalogActionContext(), id);
  }

  createTable(input: CreateTableInput): { id: string } {
    return createTableModel(this.setupCatalogActionContext(), input);
  }

  updateTable(id: string, input: UpdateTableInput): { id: string } {
    return updateTableModel(this.setupCatalogActionContext(), id, input);
  }

  removeTable(id: string): { id: string; deleted: boolean; active: boolean } {
    return removeTableModel(this.setupCatalogActionContext(), id);
  }

  listProductionUnits(): unknown[] {
    return listProductionUnitReadModels(this.db);
  }

  createProductionUnit(input: CreateProductionUnitInput): { id: string } {
    return createProductionUnitModel(this.setupCatalogActionContext(), input);
  }

  updateProductionUnit(id: string, input: UpdateProductionUnitInput): { id: string } {
    return updateProductionUnitModel(this.setupCatalogActionContext(), id, input);
  }

  removeProductionUnit(id: string): { id: string; deleted: boolean; active: boolean } {
    return removeProductionUnitModel(this.setupCatalogActionContext(), id);
  }

  listMenuItems(includeInactive = false): unknown[] {
    return listMenuItemReadModels(this.db, includeInactive);
  }

  getCurrentMenuPopularity(): Array<{ menuItemId: string; quantity: number }> {
    const businessDay = this.ensureCurrentBusinessDay() as { id: string };
    return getCurrentMenuPopularityModel(this.db, businessDay.id);
  }

  private listVariantsForMenuItems(menuItemIds: string[], includeInactive = false): Map<string, MenuItemVariantRow[]> {
    return listVariantModelsForMenuItems(this.db, menuItemIds, includeInactive);
  }

  createMenuItem(input: CreateMenuItemInput): { id: string } {
    return createMenuItemModel(this.menuItemActionContext(), input);
  }

  importMenuItemsFromCsv(csv: string): CsvImportResult {
    return importMenuItemsFromCsvModel(this.menuItemActionContext(), csv);
  }

  updateMenuItem(id: string, input: UpdateMenuItemInput): { id: string } {
    return updateMenuItemModel(this.menuItemActionContext(), id, input);
  }

  setMenuItemActive(id: string, active: boolean): { id: string; active: boolean } {
    return setMenuItemActiveModel(this.menuItemActionContext(), id, active);
  }

  removeMenuItem(id: string): { id: string; deleted: boolean; active: boolean } {
    return removeMenuItemModel(this.menuItemActionContext(), id);
  }

  removeMenuItemWithApproval(id: string, input: BulkMenuDeleteInput): { id: string; deleted: boolean; active: boolean } {
    return removeMenuItemWithApprovalModel(this.menuItemActionContext(), id, input);
  }

  bulkRemoveMenuItems(kind: BulkMenuDeleteKind, input: BulkMenuDeleteInput): BulkMenuDeleteResult {
    return bulkRemoveMenuItemsModel(this.menuItemActionContext(), kind, input);
  }

  private isAlcoholMenuItem(id: string): boolean {
    return isAlcoholMenuItemModel(this.orm, id);
  }

  listAlcoholCatalog(): unknown {
    return listAlcoholCatalogModel(this.alcoholActionContext());
  }

  listAlcoholStorage(): unknown[] {
    return listAlcoholStorageModel(this.alcoholActionContext());
  }

  createAlcoholItem(input: CreateAlcoholItemInput): { id: string } {
    return createAlcoholItemModel(this.alcoholActionContext(), input);
  }

  importAlcoholItemsFromCsv(csv: string, type: "plain_liquor" | "prepared_product"): CsvImportResult {
    return importAlcoholItemsFromCsvModel(this.alcoholActionContext(), csv, type);
  }

  updateAlcoholItem(id: string, input: UpdateAlcoholItemInput): { id: string } {
    return updateAlcoholItemModel(this.alcoholActionContext(), id, input);
  }

  adjustAlcoholStock(menuItemId: string, input: AdjustAlcoholStockInput): { id: string } {
    return adjustAlcoholStockModel(this.alcoholActionContext(), menuItemId, input);
  }

  listAlcoholStockMovements(limit = 100): unknown[] {
    return listAlcoholStockMovementsModel(this.alcoholActionContext(), limit);
  }

  updateKotStatus(kotId: string, input: UpdateKotStatusInput): { id: string; status: string } {
    return updateKotStatusModel({
      orm: this.orm,
      db: this.db,
      createReadyNotification: (id) => this.createReadyNotification(id),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    }, kotId, input);
  }

  listReadyNotifications(actor: DeviceActor): unknown[] {
    return listReadyNotificationModels(this.orm, actor);
  }

  getTableOrder(tableId: string): unknown {
    const table = this.requireTable(tableId);
    if (!table.current_order_id) return null;
    return this.getOrder(table.current_order_id);
  }

  getOrder(orderId: string): unknown {
    return getOrderReadModel(this.db, orderId);
  }

  listPrintJobs(limit = 50): unknown[] {
    return listPrintJobReadModels(this.db, limit);
  }

  retryPrintJob(printJobId: string, input: RetryPrintJobInput): { id: string } {
    retryPrintJobRecord(this.db, printJobId);
    this.appendEvent("print_job.retry_requested", "print_job", printJobId, { ...input, printJobId });
    return { id: printJobId };
  }

  getReceiptPrinter(): { printerMode: "system" | "network"; printerHost: string | null; printerPort: number | null; printerName: string | null } {
    return getReceiptPrinterModel(this.printSettingsActionContext());
  }

  getBillPrinters(): BillPrinterProfiles {
    return getBillPrintersModel(this.printSettingsActionContext());
  }

  updateReceiptPrinter(input: UpdateReceiptPrinterInput): UpdateReceiptPrinterInput {
    return updateReceiptPrinterModel(this.printSettingsActionContext(), input);
  }

  updateBillPrinters(input: UpdateBillPrintersInput): BillPrinterProfiles {
    return updateBillPrintersModel(this.printSettingsActionContext(), input);
  }

  private getBillPrinterProfile(slot: BillPrinterSlot): BillPrinterProfile {
    return getBillPrinterProfileModel(this.printSettingsActionContext(), slot);
  }

  private resolveBillPrinter(slot: BillPrinterSlot = "default"): {
    printerHost: string | null;
    printerPort: number | null;
    printerName: string | null;
  } {
    return resolveBillPrinterModel(this.printSettingsActionContext(), slot);
  }

  getPrinterOutputMode(): PrinterOutputMode {
    return getPrinterOutputModeModel(this.printSettingsActionContext());
  }

  ensurePrinterOutputMode(defaultMode: PrinterOutputMode): PrinterOutputMode {
    return ensurePrinterOutputModeModel(this.printSettingsActionContext(), defaultMode);
  }

  updatePrinterOutputMode(mode: PrinterOutputMode): { mode: PrinterOutputMode } {
    return updatePrinterOutputModeModel(this.printSettingsActionContext(), mode);
  }

  enqueueTestBillPrint(requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
    return enqueueTestBillPrintModel(this.printSettingsActionContext(), requestedBy, printerSlot);
  }

  enqueueTestKotPrint(requestedBy: string): { printJobId: string } {
    return enqueueTestKotPrintModel(this.printSettingsActionContext(), requestedBy);
  }

  getSyncStatus(): unknown {
    return getSyncStatusReadModel(this.orm, this.db);
  }

  getCurrentBusinessDaySummary(): unknown {
    this.finalizeCompletedBusinessDays();
    this.removeEmptyPendingBills();
    return buildDaySummary(this.db, this.ensureCurrentBusinessDay().id);
  }

  listDailyReports(limit = 30): unknown[] {
    this.finalizeCompletedBusinessDays();
    this.removeEmptyPendingBills();
    return listDailyReportSnapshots(this.db, limit);
  }

  getDailyReport(posDayId: string): unknown {
    return getDailyReportSnapshot(this.db, posDayId);
  }

  getRangeReport(input: ReportRangeQueryInput): unknown {
    this.finalizeCompletedBusinessDays();
    this.removeEmptyPendingBills();
    return buildRangeReport(this.db, input);
  }

  reviseBill(billId: string, input: ReviseBillInput): { billId: string; revisionNumber: number; totalPaise: number; kotIds: string[]; printJobIds: string[] } {
    return reviseBillModel(this.billActionContext(), billId, input);
  }

  editHistoryBill(billId: string, input: HistoryEditBillInput): { billId: string; revisionNumber: number; totalPaise: number; printJobId: string; modified: boolean } {
    return editHistoryBillModel(this.billActionContext(), billId, input);
  }

  markBillNc(billId: string, input: MarkNcBillInput): { billId: string; printJobId: string } {
    return markBillNcModel(this.billActionContext(), billId, input);
  }

  printBill(billId: string, requestedBy: string, printerSlot: BillPrinterSlot = "default"): { printJobId: string } {
    return printBillModel(this.billActionContext(), billId, requestedBy, printerSlot);
  }

  private billLifecycleContext(): BillLifecycleContext {
    return {
      orm: this.orm,
      db: this.db,
      requireEditableOrder: (orderId) => this.requireEditableOrder(orderId),
      requireOrderById: (orderId) => this.requireOrderById(orderId),
      requireTable: (tableId) => this.requireTable(tableId),
      getOrderItems: (orderId) => this.getOrderItems(orderId),
      calculateBillTotals: (items) => this.calculateBillTotals(items),
      nextBillNumber: () => this.nextBillNumber(),
      recordBillRevision: (billId, revisionNumber, totals, reason, changedBy, now, financials) => this.recordBillRevision(billId, revisionNumber, totals, reason, changedBy, now, financials),
      getBillById: (billId) => this.getBillById(billId),
      resolveBillPrinter: (slot) => this.resolveBillPrinter(slot),
      buildBillTicket: (input) => this.buildBillTicket(input),
      enqueuePrintJob: (input) => this.enqueuePrintJob(input),
      getBillPaidPaise: (billId) => this.getBillPaidPaise(billId),
      deductAlcoholStockForPaidBill: (billId, orderId) => this.deductAlcoholStockForPaidBill(billId, orderId),
      freeTable: (tableId) => this.freeTable(tableId),
      finalizeCompletedBusinessDays: () => this.finalizeCompletedBusinessDays(),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private billCleanupContext(): BillCleanupContext {
    return {
      orm: this.orm,
      db: this.db,
      deleteLocalBillRecord: (billId) => this.deleteLocalBillRecord(billId),
      freeTable: (tableId) => this.freeTable(tableId),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private setupCatalogActionContext(): SetupCatalogActionContext {
    return {
      orm: this.orm,
      db: this.db,
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private settingsActionContext(): SettingsActionContext {
    return {
      readSetting: (key) => this.getSetting(key),
      writeSetting: (key, value) => this.upsertSetting(key, value),
      listProductionUnits: () => this.listProductionUnits(),
      requireProductionUnit: (productionUnitId) => this.requireProductionUnit(productionUnitId),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      verifyMasterApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyMasterApproval(input, action, aggregateType, aggregateId, requestedBy),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private menuItemActionContext(): MenuItemActionContext {
    return {
      orm: this.orm,
      db: this.db,
      resolveProductionUnitRef: (value) => this.resolveProductionUnitRef(value),
      resolveSaleGroupRef: (value) => this.resolveSaleGroupRef(value),
      countAlcoholRecipeSnapshotUsage: (menuItemId) => this.countAlcoholRecipeSnapshotUsage(menuItemId),
      isAlcoholMenuItem: (id) => this.isAlcoholMenuItem(id),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      verifyMasterApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyMasterApproval(input, action, aggregateType, aggregateId, requestedBy),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private alcoholActionContext(): AlcoholActionContext {
    return {
      orm: this.orm,
      db: this.db,
      calculatePendingAlcoholUsage: () => this.calculatePendingAlcoholUsage(),
      listVariantsForMenuItems: (menuItemIds, includeInactive) => this.listVariantsForMenuItems(menuItemIds, includeInactive),
      defaultAlcoholProductionUnitId: () => this.defaultAlcoholProductionUnitId(),
      requireProductionUnit: (productionUnitId) => this.requireProductionUnit(productionUnitId),
      assertAlcoholRecipeMatchesType: (type, ingredients) => this.assertAlcoholRecipeMatchesType(type, ingredients),
      assertAlcoholVariantsMatchType: (type, variants) => this.assertAlcoholVariantsMatchType(type, variants),
      assertAlcoholHasSellableVariant: (active, variants, menuItemId) => this.assertAlcoholHasSellableVariant(active, variants, menuItemId),
      createMenuItem: (input) => this.createMenuItem(input),
      updateMenuItem: (id, input) => this.updateMenuItem(id, input),
      replaceAlcoholVariants: (menuItemId, variants) => this.replaceAlcoholVariants(menuItemId, variants),
      replaceAlcoholRecipe: (menuItemId, ingredients) => this.replaceAlcoholRecipe(menuItemId, ingredients),
      findMenuItemIdByName: (name) => this.findMenuItemIdByName(name),
      resolveProductionUnitRef: (value) => this.resolveProductionUnitRef(value),
      parseAlcoholRecipeCsv: (value) => this.parseAlcoholRecipeCsv(value),
      requireAlcoholStock: (menuItemId) => this.requireAlcoholStock(menuItemId),
      writeAlcoholStock: (menuItemId, sealedLarge, openLargeMl, sealedSmall) => this.writeAlcoholStock(menuItemId, sealedLarge, openLargeMl, sealedSmall),
      recordAlcoholMovement: (input) => this.recordAlcoholMovement(input),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      verifyMasterApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyMasterApproval(input, action, aggregateType, aggregateId, requestedBy),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private printSettingsActionContext(): PrintSettingsActionContext {
    return {
      db: this.db,
      readSetting: (key) => this.getSetting(key),
      writeSetting: (key, value) => this.upsertSetting(key, value),
      getPrintLayout: (scope, productionUnitId) => this.getPrintLayout(scope, productionUnitId),
      enqueuePrintJob: (input) => this.enqueuePrintJob(input),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private billActionContext(): BillActionContext {
    return {
      orm: this.orm,
      db: this.db,
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      verifyMasterApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyMasterApproval(input, action, aggregateType, aggregateId, requestedBy),
      applyBillAdjustments: (billId, input, requestedBy, mode) => this.applyBillAdjustments(billId, input, requestedBy, mode),
      enqueueBillReprint: (billId, suffix, printerSlot) => this.enqueueBillReprint(billId, suffix, printerSlot),
      getBillById: (billId) => this.getBillById(billId),
      getBillPaidPaise: (billId) => this.getBillPaidPaise(billId),
      requireOrderById: (orderId) => this.requireOrderById(orderId),
      requireTable: (tableId) => this.requireTable(tableId),
      getOrderItems: (orderId) => this.getOrderItems(orderId),
      prepareSubmittedItems: (items, allowedInactiveVariantIds, previousItemsById) => this.prepareSubmittedItems(items, allowedInactiveVariantIds, previousItemsById),
      getMenuItems: (ids) => this.getMenuItems(ids),
      applyOrderItemDiff: (orderId, requestedItems, previousItems, menuById, now, cancelMissing) => this.applyOrderItemDiff(orderId, requestedItems, previousItems, menuById, now, cancelMissing),
      createKotsForChanges: (order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note) =>
        this.createKotsForChanges(order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note),
      calculateBillTotals: (items) => this.calculateBillTotals(items),
      recordBillRevision: (billId, revisionNumber, totals, reason, changedBy, now, financials) => this.recordBillRevision(billId, revisionNumber, totals, reason, changedBy, now, financials),
      applyAlcoholUsageDeltaForHistoryEdit: (billId, before, after) => this.applyAlcoholUsageDeltaForHistoryEdit(billId, before, after),
      replaceHistoryEditPayments: (bill, requestedPayments, finalTotalPaise, receivedBy, now) => this.replaceHistoryEditPayments(bill, requestedPayments, finalTotalPaise, receivedBy, now),
      resolveBillPrinter: (slot) => this.resolveBillPrinter(slot),
      buildBillTicket: (input) => this.buildBillTicket(input),
      enqueuePrintJob: (input) => this.enqueuePrintJob(input),
      refreshDailyReportSnapshot: (posDayId, now) => this.refreshDailyReportSnapshot(posDayId, now),
      deductAlcoholStockForPaidBill: (billId, orderId) => this.deductAlcoholStockForPaidBill(billId, orderId),
      freeTable: (tableId) => this.freeTable(tableId),
      finalizeCompletedBusinessDays: () => this.finalizeCompletedBusinessDays(),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private orderStateUpdateContext(): OrderStateUpdateContext {
    return {
      orm: this.orm,
      db: this.db,
      requireOrderById: (orderId) => this.requireOrderById(orderId),
      requireTable: (tableId) => this.requireTable(tableId),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      getOrderItems: (orderId) => this.getOrderItems(orderId),
      prepareSubmittedItems: (items, allowedInactiveVariantIds, previousItemsById) => this.prepareSubmittedItems(items, allowedInactiveVariantIds, previousItemsById),
      getMenuItems: (ids) => this.getMenuItems(ids),
      applyOrderItemDiff: (orderId, requestedItems, previousItems, menuById, now, cancelMissing) => this.applyOrderItemDiff(orderId, requestedItems, previousItems, menuById, now, cancelMissing),
      calculateBillTotals: (items) => this.calculateBillTotals(items),
      createKotsForChanges: (order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note) =>
        this.createKotsForChanges(order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note),
      getBillForOrder: (orderId) => this.getBillForOrder(orderId),
      getBillPaidPaise: (billId) => this.getBillPaidPaise(billId),
      deleteLocalBillRecord: (billId) => this.deleteLocalBillRecord(billId),
      recordBillRevision: (billId, revisionNumber, totals, reason, changedBy, now, financials) => this.recordBillRevision(billId, revisionNumber, totals, reason, changedBy, now, financials),
      freeTable: (tableId) => this.freeTable(tableId),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  moveTable(input: MoveTableInput, actor: DeviceActor): { fromTableId: string; toTableId: string; orderId: string; kotIds: string[]; printJobIds: string[] } {
    return moveTableModel(this.tableTransferContext(), input, actor);
  }

  moveOrderItems(input: MoveOrderItemsInput, actor: DeviceActor): { fromOrderId: string; toOrderId: string; movementId: string; sourceKotIds: string[]; targetKotIds: string[]; printJobIds: string[] } {
    return moveOrderItemsModel(this.tableTransferContext(), input, actor);
  }

  private orderLifecycleContext(): OrderLifecycleContext {
    return {
      orm: this.orm,
      db: this.db,
      finalizeCompletedBusinessDays: () => this.finalizeCompletedBusinessDays(),
      ensureCurrentBusinessDay: () => this.ensureCurrentBusinessDay(),
      requireTable: (tableId) => this.requireTable(tableId),
      requireEditableOrder: (orderId) => this.requireEditableOrder(orderId),
      createOrder: (input, posDayId, now, actor) => this.createOrder(input, posDayId, now, actor),
      prepareSubmittedItems: (items, allowedInactiveVariantIds, previousItemsById) => this.prepareSubmittedItems(items, allowedInactiveVariantIds, previousItemsById),
      getOrderItems: (orderId) => this.getOrderItems(orderId),
      getMenuItems: (ids) => this.getMenuItems(ids),
      getUnits: (ids) => this.getUnits(ids),
      getOrderItemById: (orderItemId) => this.getOrderItemById(orderItemId),
      kotChangeFromOrderItem: (item, quantityDelta) => this.kotChangeFromOrderItem(item, quantityDelta),
      applyOrderItemDiff: (orderId, requestedItems, previousItems, menuById, now, cancelMissing) => this.applyOrderItemDiff(orderId, requestedItems, previousItems, menuById, now, cancelMissing),
      createKotsForChanges: (order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note) =>
        this.createKotsForChanges(order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      freeTable: (tableId) => this.freeTable(tableId),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private tableTransferContext(): TableTransferContext {
    return {
      orm: this.orm,
      db: this.db,
      requireTable: (tableId) => this.requireTable(tableId),
      requireOrderById: (orderId) => this.requireOrderById(orderId),
      requireEditableOrder: (orderId) => this.requireEditableOrder(orderId),
      assertCanMoveOrder: (order, actor, action) => this.assertCanMoveOrder(order, actor, action),
      createOrder: (input, posDayId, now, actor) => this.createOrder(input, posDayId, now, actor),
      getOrderItems: (orderId) => this.getOrderItems(orderId),
      getOrderItemById: (orderItemId) => this.getOrderItemById(orderItemId),
      kotChangeFromOrderItem: (item, quantityDelta) => this.kotChangeFromOrderItem(item, quantityDelta),
      createKotsForChanges: (order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note) =>
        this.createKotsForChanges(order, table, changes, now, isNewOrder, forceCancelled, reason, typeOverride, sequenceOrderId, printTickets, note),
      freeTable: (tableId) => this.freeTable(tableId),
      appendEvent: (type, aggregateType, aggregateId, payload) => this.appendEvent(type, aggregateType, aggregateId, payload)
    };
  }

  private prepareSubmittedItems(
    items: SubmitOrderInput["items"],
    allowedInactiveVariantIds = new Set<string>(),
    previousItemsById = new Map<string, OrderItemRow>()
  ): RequestedOrderItem[] {
    return prepareSubmittedItemsModel({
      ctx: this.submittedItemContext(),
      items,
      allowedInactiveVariantIds,
      previousItemsById
    });
  }

  private submittedItemContext(): SubmittedItemContext {
    return {
      getMenuItems: (ids) => this.getMenuItems(ids),
      resolveMenuItemVariant: (menuItemId, variantId, allowInactive) => this.resolveMenuItemVariant(menuItemId, variantId, allowInactive),
      verifyManagerApproval: (input, action, aggregateType, aggregateId, requestedBy) => this.verifyManagerApproval(input, action, aggregateType, aggregateId, requestedBy),
      snapshotAlcoholRecipe: (menuItemId) => this.snapshotAlcoholRecipe(menuItemId),
      requireSaleGroup: (id) => this.requireSaleGroup(id),
      requireProductionUnit: (productionUnitId) => this.requireProductionUnit(productionUnitId),
      itemKey: (menuItemId, orderItemId, variantId) => this.itemKey(menuItemId, orderItemId, variantId)
    };
  }

  private buildBillTicket(input: {
    bill: Pick<BillRow, "id" | "bill_number" | "order_id" | "subtotal_paise" | "tax_paise" | "total_paise" | "discount_paise" | "tip_paise" | "final_total_paise" | "revision_number" | "nc_reason">;
    tableName: string;
    createdAt: string;
    discountPaise?: number;
    tipPaise?: number;
    finalTotalPaise?: number;
    ncReason?: string | null;
  }) {
    return buildBillTicketModel({
      db: this.db,
      ...input,
      orderItems: this.getOrderItems(input.bill.order_id),
      receiptLayout: this.getPrintLayout("receipt")
    });
  }

  private calculateBillTotals(items: OrderItemRow[]): BillTotals {
    return calculateBillTotalsModel(this.orm, items);
  }

  private deductAlcoholStockForPaidBill(billId: string, orderId: string): void {
    deductAlcoholStockForPaidBillModel(this.orm, this.db, billId, orderId);
  }

  private calculatePendingAlcoholUsage(): AlcoholUsage {
    return calculatePendingAlcoholUsageModel(this.db);
  }

  private snapshotAlcoholRecipe(menuItemId: string): string {
    return snapshotAlcoholRecipeModel(this.db, menuItemId);
  }

  private countAlcoholRecipeSnapshotUsage(menuItemId: string): number {
    return countAlcoholRecipeSnapshotUsageModel(this.db, menuItemId);
  }

  private applyAlcoholUsageDeltaForHistoryEdit(
    billId: string,
    before: AlcoholUsage,
    after: AlcoholUsage
  ): void {
    applyAlcoholUsageDeltaForHistoryEditModel(this.orm, this.db, billId, before, after);
  }

  private recordBillRevision(
    billId: string,
    revisionNumber: number,
    totals: BillTotals,
    reason: string,
    changedBy: string,
    now: string,
    financials: { discountPaise: number; tipPaise: number; finalTotalPaise: number } = {
      discountPaise: 0,
      tipPaise: 0,
      finalTotalPaise: totals.totalPaise
    }
  ): void {
    recordBillRevisionModel(this.orm, billId, revisionNumber, totals, reason, changedBy, now, financials);
  }

  private verifyManagerApproval(
    approval: ManagerApprovalInput | undefined,
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy = "captain"
  ): void {
    verifyApproval({
      orm: this.orm,
      approval,
      configuredHash: this.getSetting("manager_pin_hash"),
      settingKey: "manager_pin_hash",
      missingConfiguredMessage: "Set a manager PIN before using manager-only actions",
      missingApprovalMessage: "Manager approval is required for this action",
      invalidPinMessage: "Manager PIN is incorrect",
      action,
      aggregateType,
      aggregateId,
      requestedBy
    });
  }

  private verifyMasterApproval(
    approval: MasterApprovalInput | undefined,
    action: string,
    aggregateType: string,
    aggregateId: string,
    requestedBy = "owner"
  ): void {
    verifyApproval({
      orm: this.orm,
      approval,
      configuredHash: this.getSetting("master_pin_hash"),
      settingKey: "master_pin_hash",
      missingConfiguredMessage: "Create a Master PIN before using owner-only actions",
      missingApprovalMessage: "Master PIN is required for this action",
      invalidPinMessage: "Master PIN is incorrect",
      action,
      aggregateType,
      aggregateId,
      requestedBy
    });
  }

  private upsertSetting(key: string, value: string): void {
    writeSettingRecord(this.orm, key, value);
  }

  private requireSaleGroup(id: string) {
    return requireSaleGroupModel(this.db, id);
  }

  private findMenuItemIdByName(name: string): string | null {
    return findMenuItemIdByNameModel(this.db, name);
  }

  private resolveProductionUnitRef(value: string | null): string | null {
    return resolveProductionUnitRefModel(this.db, value);
  }

  private resolveSaleGroupRef(value: string): string {
    return resolveSaleGroupRefModel(this.db, value);
  }

  private resolvePlainLiquorRef(value: string): string {
    return resolvePlainLiquorRefModel(this.db, value);
  }

  private parseAlcoholRecipeCsv(value: string | null): Array<{ liquorMenuItemId: string; mlPerUnit: number }> {
    return parseAlcoholRecipeCsvModel(this.db, value);
  }

  private defaultAlcoholProductionUnitId(): string | null {
    return defaultAlcoholProductionUnitIdModel(this.db);
  }

  private assertAlcoholRecipeMatchesType(type: "plain_liquor" | "prepared_product", ingredients: CreateAlcoholItemInput["recipeIngredients"]): void {
    assertAlcoholRecipeMatchesTypeModel(type, ingredients);
  }

  private assertAlcoholVariantsMatchType(type: "plain_liquor" | "prepared_product", variants: CreateAlcoholItemInput["variants"]): void {
    assertAlcoholVariantsMatchTypeModel(type, variants);
  }

  private assertAlcoholHasSellableVariant(active: boolean, variants?: CreateAlcoholItemInput["variants"], menuItemId?: string): void {
    assertAlcoholHasSellableVariantModel(this.orm, active, variants, menuItemId);
  }

  private replaceAlcoholVariants(menuItemId: string, variants: CreateAlcoholItemInput["variants"]): void {
    replaceAlcoholVariantsModel(this.orm, menuItemId, variants);
  }

  private replaceAlcoholRecipe(menuItemId: string, ingredients: CreateAlcoholItemInput["recipeIngredients"]): void {
    replaceAlcoholRecipeModel(this.orm, menuItemId, ingredients);
  }

  private requireAlcoholStock(menuItemId: string) {
    return requireAlcoholStockModel(this.db, menuItemId);
  }

  private writeAlcoholStock(menuItemId: string, sealedLarge: number, openLargeMl: number, sealedSmall: number, allowNegative = false): void {
    writeAlcoholStockModel(this.orm, menuItemId, sealedLarge, openLargeMl, sealedSmall, allowNegative);
  }

  private recordAlcoholMovement(input: {
    menuItemId: string;
    sourceType: string;
    sourceId: string;
    deltaSealedLarge: number;
    deltaOpenLargeMl: number;
    deltaSealedSmall: number;
    balanceSealedLarge: number;
    balanceOpenLargeMl: number;
    balanceSealedSmall: number;
    approvedBy?: string | null;
  }): void {
    recordAlcoholMovementModel(this.orm, input);
  }

  private assertCanMoveOrder(order: OrderRow, actor: DeviceActor, action: "table" | "items"): void {
    assertCanMoveOrderModel(order, actor, action);
  }

  private createOrder(input: Pick<SubmitOrderInput, "tableId" | "pax" | "orderType"> & { captainId: string }, posDayId: string, now: string, actor?: DeviceActor): OrderRow {
    return createOrderRecord(this.orm, input, posDayId, now, actor);
  }

  private applyOrderItemDiff(
    orderId: string,
    requestedItems: RequestedOrderItem[],
    previousItems: OrderItemRow[],
    menuById: Map<string, MenuItemRow>,
    now: string,
    cancelMissing = false
  ): KotItemChange[] {
    return applyOrderItemDiffModel({
      orm: this.orm,
      orderId,
      requestedItems,
      previousItems,
      menuById,
      now,
      cancelMissing,
      getUnit: (productionUnitId) => this.getUnit(productionUnitId)
    });
  }

  private createKotsForChanges(
    order: OrderRow,
    table: TableRow,
    changes: KotItemChange[],
    now: string,
    isNewOrder: boolean,
    forceCancelled: boolean,
    reason?: string,
    typeOverride?: KotType,
    sequenceOrderId?: string,
    printTickets = true,
    note?: string
  ): TicketCreationResult {
    return createKotsForChangesModel({
      orm: this.orm,
      order,
      table,
      changes,
      now,
      isNewOrder,
      forceCancelled,
      reason,
      typeOverride,
      sequenceOrderId,
      printTickets,
      note,
      sequenceForKotGroup: (targetOrderId, productionUnitId, ticketLabel) => this.sequenceForKotGroup(targetOrderId, productionUnitId, ticketLabel),
      getPrintLayout: (scope, productionUnitId) => this.getPrintLayout(scope, productionUnitId),
      enqueuePrintJob: (job) => this.enqueuePrintJob(job),
      appendEvent: (type, aggregateType, aggregateId, payload) => {
        this.appendEvent(type, aggregateType, aggregateId, payload);
      }
    });
  }

  private enqueuePrintJob(input: PrintJobInput): string {
    return enqueuePrintJobRecord(this.orm, input);
  }

  private appendEvent(type: string, aggregateType: string, aggregateId: string, payload: unknown): DomainEvent {
    return appendDomainEvent(this.orm, type, aggregateType, aggregateId, payload);
  }

  private ensureCurrentBusinessDay(now = new Date()): BusinessDayRow {
    return ensureCurrentBusinessDayModel({ orm: this.orm, now, appendEvent: this.appendEvent.bind(this) });
  }

  private getBusinessDayById(id: string): BusinessDayRow | undefined {
    return getBusinessDayByIdModel(this.orm, id);
  }

  private finalizeCompletedBusinessDays(now = new Date()): void {
    finalizeCompletedBusinessDayModels({ orm: this.orm, db: this.db, now, appendEvent: this.appendEvent.bind(this) });
  }

  private refreshDailyReportSnapshot(posDayId: string, now = new Date().toISOString()): void {
    refreshDailyReportSnapshotModel({ orm: this.orm, db: this.db, posDayId, now });
  }

  private requireTable(tableId: string): TableRow {
    return requireTableModel(this.orm, tableId);
  }

  private requireProductionUnit(productionUnitId: string): void {
    requireProductionUnitQuery(this.orm, productionUnitId);
  }

  private requireEditableOrder(orderId: string): OrderRow {
    return requireEditableOrderRecord(this.orm, orderId);
  }

  private getMenuItems(ids: string[]): Map<string, MenuItemRow> {
    return getMenuItemsByIds(this.db, ids);
  }

  private resolveMenuItemVariant(menuItemId: string, variantId?: string, allowInactive = false): MenuItemVariantRow {
    return resolveMenuItemVariantModel(this.db, this.orm, menuItemId, variantId, allowInactive);
  }

  private getUnits(ids: string[]) {
    return getProductionUnitsByIds(this.orm, ids);
  }

  private kotChangeFromOrderItem(item: OrderItemRow, quantityDelta: number): KotItemChange | null {
    return kotChangeFromOrderItemModel(item, quantityDelta, (productionUnitId) => this.getUnit(productionUnitId));
  }

  private getOrderItems(orderId: string): OrderItemRow[] {
    return listOrderItems(this.orm, orderId);
  }

  private getOrderItemByKey(orderId: string, menuItemId: string, variantId?: string | null): OrderItemRow | undefined {
    return getOrderItemByMenuKey(this.orm, orderId, menuItemId, variantId);
  }

  private getOrderItemByKeyOrName(orderId: string, menuItemId: string | null, name: string): OrderItemRow | undefined {
    if (menuItemId) return this.getOrderItemByKey(orderId, menuItemId);
    return getOpenOrderItemByName(this.orm, orderId, name);
  }

  private getUnit(productionUnitId: string) {
    return getProductionUnit(this.orm, productionUnitId);
  }

  private createReadyNotification(kotId: string): void {
    createReadyNotificationModel(this.orm, this.db, kotId);
  }

  private getOrderItemById(orderItemId: string): OrderItemRow | undefined {
    return getOrderItemById(this.orm, orderItemId);
  }

  private itemKey(menuItemId: string | null, orderItemId?: string, variantId?: string | null): string {
    return buildOrderItemKey(menuItemId, orderItemId, variantId);
  }

  private nextKotSequence(): number {
    return nextKotSequenceModel(this.orm);
  }

  private nextBillNumber(): number {
    return nextBillNumberModel(this.orm, (key, value) => this.upsertSetting(key, value));
  }

  private sequenceForKotGroup(orderId: string, productionUnitId: string, ticketLabel: "KOT" | "BOT"): number {
    return sequenceForKotGroupModel(this.orm, this.db, orderId, productionUnitId, ticketLabel);
  }

  private freeTable(tableId: string): void {
    freeTableRecord(this.orm, tableId);
  }

  private getSetting(key: string): string | undefined {
    return readSettingRecord(this.orm, key);
  }

  private getBillPaidPaise(billId: string): number {
    return getBillPaidPaiseModel(this.orm, billId);
  }

  private syncPaidBillPaymentToFinalTotal(billId: string, finalTotalPaise: number, receivedBy: string, now: string): void {
    syncPaidBillPaymentToFinalTotalModel(this.orm, this.db, this.getBillById(billId), billId, finalTotalPaise, receivedBy, now);
  }

  private replaceHistoryEditPayments(
    bill: BillRow,
    requestedPayments: HistoryEditBillInput["payments"],
    finalTotalPaise: number,
    receivedBy: string,
    now: string
  ): void {
    replaceHistoryEditPaymentsModel(this.orm, bill, requestedPayments, finalTotalPaise, receivedBy, now);
  }

  private deleteLocalBillRecord(billId: string): void {
    deleteLocalBillRecordModel(this.orm, billId);
  }

  private removeEmptyPendingBills(): void {
    removeEmptyPendingBillsModel(this.billCleanupContext());
  }

  private applyBillAdjustments(billId: string, input: BillAdjustmentInput, requestedBy: string, mode: "any" | "pending_only" = "any"): void {
    applyBillAdjustmentsModel(this.orm, this.db, this.getBillById(billId), input, requestedBy, mode);
  }

  private selectOrderById(orderId: string): OrderRow | undefined {
    return selectOrderByIdRecord(this.orm, orderId);
  }

  private requireOrderById(orderId: string): OrderRow {
    return requireOrderByIdRecord(this.orm, orderId);
  }

  private getBillById(billId: string): BillRow | undefined {
    return getBillById(this.orm, billId);
  }

  private getBillForOrder(orderId: string): BillRow | undefined {
    return getLatestBillForOrder(this.orm, orderId);
  }
}
