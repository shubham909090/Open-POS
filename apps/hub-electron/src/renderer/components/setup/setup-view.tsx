import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchMenuItems } from "@gaurav-pos/shared";
import { useContext, useEffect, useState } from "react";
import { hubApi, type Bootstrap, type CsvImportResult } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { DevicePairingCard } from "./device-pairing-card.js";
import { BusinessDayCard } from "./setup-business-day-card.js";
import {
  DishesCard,
  FloorsTablesCard,
  KitchensCountersCard,
} from "./setup-catalog-cards.js";
import { HubConnectionCard } from "./hub-connection-card.js";
import { KdsOperationsCard } from "./kds-operations-card.js";
import { PrinterSetupCard } from "./printer-setup-card.js";
import { PaymentQrPanel } from "./payment-qr-panel.js";
import { SettingsWorkspace } from "./settings-workspace.js";
import { setupSections } from "./settings-sections.js";
import { SettingsPageActiveContext } from "./setup-card.js";

export function SetupView({
  bootstrap,
  setNotice,
  requestManagerApproval,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const [floorName, setFloorName] = useState("");
  const [tableName, setTableName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [dishName, setDishName] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishUnit, setDishUnit] = useState("");
  const [dishGroup, setDishGroup] = useState("sg-food");
  const [dishListSearch, setDishListSearch] = useState("");
  const [dishImportResult, setDishImportResult] =
    useState<CsvImportResult | null>(null);
  const [tableFloorId, setTableFloorId] = useState("");
  const firstFloorId =
    bootstrap.floors.find((floor) => floor.active)?.id ??
    bootstrap.floors[0]?.id ??
    "";
  const activeFloors = bootstrap.floors.filter((floor) => floor.active);
  const dishSaleGroups = bootstrap.saleGroups.filter(
    (group) => group.active && group.kind !== "alcohol",
  );
  const rawSetupDishItems = bootstrap.menuItems.filter(
    (item) => item.sale_group_kind !== "alcohol",
  );
  const setupDishItems = searchMenuItems(rawSetupDishItems, dishListSearch, {
    includeInactive: true,
  });
  const dishPricePaise = Math.round(Number(dishPrice || 0) * 100);
  useEffect(() => {
    if (
      !tableFloorId ||
      !bootstrap.floors.some(
        (floor) => floor.id === tableFloorId && floor.active,
      )
    ) {
      setTableFloorId(firstFloorId);
    }
  }, [bootstrap.floors, firstFloorId, tableFloorId]);

  useEffect(() => {
    if (!dishSaleGroups.some((group) => group.id === dishGroup)) {
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
    }
  }, [dishGroup, dishSaleGroups]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  const createFloor = useMutation({
    mutationFn: () => hubApi.createFloor(floorName),
    onSuccess: async () => {
      setFloorName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createTable = useMutation({
    mutationFn: () =>
      hubApi.createTable(tableFloorId || firstFloorId, tableName),
    onSuccess: async () => {
      setTableName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createUnit = useMutation({
    mutationFn: () => hubApi.createUnit(unitName),
    onSuccess: async () => {
      setUnitName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createDish = useMutation({
    mutationFn: () =>
      hubApi.createDish({
        name: dishName,
        pricePaise: dishPricePaise,
        productionUnitId: dishUnit || null,
        saleGroupId: dishGroup,
        active: true,
      }),
    onSuccess: async () => {
      setDishName("");
      setDishPrice("");
      setDishUnit("");
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const importDishes = useMutation({
    mutationFn: (csv: string) => hubApi.importDishesCsv(csv),
    onSuccess: async (result) => {
      setDishImportResult(result);
      await invalidate();
      setNotice({
        tone: result.failed ? "bad" : "good",
        text: `${result.created} dishes added, ${result.updated} updated.${result.failed ? ` ${result.failed} rows need fixing.` : ""}`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <SettingsWorkspace
      title="Settings"
      storageKey="hub-settings-section"
      sections={setupSections}
      renderSection={(section) => (
        <>
          {section === "general" ? (
            <>
              <BusinessDayCard bootstrap={bootstrap} />

              <KdsOperationsCard bootstrap={bootstrap} setNotice={setNotice} />
            </>
          ) : null}
          {section === "cloud" ? (
            <HubConnectionCard
              bootstrap={bootstrap}
              setNotice={setNotice}
              requestManagerApproval={requestManagerApproval}
              onSaved={invalidate}
            />
          ) : null}

          {section === "printers" ? (
            <PrinterSetupCard
              bootstrap={bootstrap}
              setNotice={setNotice}
              requestManagerApproval={requestManagerApproval}
              onChanged={invalidate}
            />
          ) : null}

          {section === "payment" ? (
            <PaymentQrPanel
              masterPinConfigured={Boolean(
                bootstrap.setup?.masterPinConfigured,
              )}
              requestManagerApproval={requestManagerApproval}
              setNotice={setNotice}
            />
          ) : null}

          {section === "floor-plan" ? (
            <FloorsTablesCard
              bootstrap={bootstrap}
              activeFloors={activeFloors}
              firstFloorId={firstFloorId}
              floorName={floorName}
              setFloorName={setFloorName}
              tableName={tableName}
              setTableName={setTableName}
              tableFloorId={tableFloorId}
              setTableFloorId={setTableFloorId}
              createFloorPending={createFloor.isPending}
              createTablePending={createTable.isPending}
              onCreateFloor={() => createFloor.mutate()}
              onCreateTable={() => createTable.mutate()}
              invalidate={invalidate}
              setNotice={setNotice}
            />
          ) : null}

          {section === "stations" ? (
            <KitchensCountersCard
              bootstrap={bootstrap}
              unitName={unitName}
              setUnitName={setUnitName}
              createUnitPending={createUnit.isPending}
              onCreateUnit={() => createUnit.mutate()}
              invalidate={invalidate}
              setNotice={setNotice}
            />
          ) : null}

          {section === "menu" ? (
            <DishesCard
              bootstrap={bootstrap}
              rawSetupDishItems={rawSetupDishItems}
              setupDishItems={setupDishItems}
              dishListSearch={dishListSearch}
              setDishListSearch={setDishListSearch}
              dishName={dishName}
              setDishName={setDishName}
              dishPrice={dishPrice}
              setDishPrice={setDishPrice}
              dishUnit={dishUnit}
              setDishUnit={setDishUnit}
              dishGroup={dishGroup}
              setDishGroup={setDishGroup}
              dishSaleGroups={dishSaleGroups}
              dishPricePaise={dishPricePaise}
              createDishPending={createDish.isPending}
              importDishesPending={importDishes.isPending}
              dishImportResult={dishImportResult}
              onCreateDish={() => createDish.mutate()}
              onImportDishes={(csv) => importDishes.mutate(csv)}
              invalidate={invalidate}
              setNotice={setNotice}
              requestManagerApproval={requestManagerApproval}
            />
          ) : null}

          {section === "devices" ? (
            <DeviceSettings
              setNotice={setNotice}
              requestManagerApproval={requestManagerApproval}
              invalidate={invalidate}
            />
          ) : null}
        </>
      )}
    />
  );
}

function DeviceSettings({
  setNotice,
  requestManagerApproval,
  invalidate,
}: {
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  invalidate: () => Promise<void>;
}) {
  const active = useContext(SettingsPageActiveContext);
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: hubApi.devices,
    enabled: active,
  });
  return (
    <>
      <DevicePairingCard
        devices={query.data ?? []}
        loading={query.isFetching}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
        onChanged={async () => {
          await query.refetch();
          await invalidate();
        }}
      />
      {query.isError ? (
        <p role="alert" className="warning-text">
          {messageOf(query.error)}{" "}
          <button
            type="button"
            className="secondary-button"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}
    </>
  );
}
