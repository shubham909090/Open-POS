import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchMenuItems } from "@gaurav-pos/shared";
import { useEffect, useState } from "react";
import { hubApi, type Bootstrap, type CsvImportResult } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { DevicePairingCard } from "./device-pairing-card.js";
import { BusinessDayCard } from "./setup-business-day-card.js";
import { DishesCard, FloorsTablesCard, KitchensCountersCard } from "./setup-catalog-cards.js";
import { HubConnectionCard } from "./hub-connection-card.js";
import { PrinterSetupCard } from "./printer-setup-card.js";

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
  const [dishImportResult, setDishImportResult] = useState<CsvImportResult | null>(null);
  const [tableFloorId, setTableFloorId] = useState("");
  const firstFloorId = bootstrap.floors.find((floor) => floor.active)?.id ?? bootstrap.floors[0]?.id ?? "";
  const activeFloors = bootstrap.floors.filter((floor) => floor.active);
  const dishSaleGroups = bootstrap.saleGroups.filter((group) => group.active && group.kind !== "alcohol");
  const rawSetupDishItems = bootstrap.menuItems.filter((item) => item.sale_group_kind !== "alcohol");
  const setupDishItems = searchMenuItems(rawSetupDishItems, dishListSearch, { includeInactive: true });
  const dishPricePaise = Math.round(Number(dishPrice || 0) * 100);
  useEffect(() => {
    if (!tableFloorId || !bootstrap.floors.some((floor) => floor.id === tableFloorId && floor.active)) {
      setTableFloorId(firstFloorId);
    }
  }, [bootstrap.floors, firstFloorId, tableFloorId]);

  useEffect(() => {
    if (!dishSaleGroups.some((group) => group.id === dishGroup)) {
      setDishGroup(dishSaleGroups[0]?.id ?? "sg-food");
    }
  }, [dishGroup, dishSaleGroups]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  const devices = useQuery({ queryKey: ["devices"], queryFn: hubApi.devices });
  const createFloor = useMutation({
    mutationFn: () => hubApi.createFloor(floorName),
    onSuccess: async () => {
      setFloorName("");
      await invalidate();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const createTable = useMutation({
    mutationFn: () => hubApi.createTable(tableFloorId || firstFloorId, tableName),
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
        text: result.failed ? `${result.created} dishes imported. ${result.failed} rows need fixing.` : `${result.created} dishes imported.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <div className="grid gap-4">
      <BusinessDayCard bootstrap={bootstrap} />

      <HubConnectionCard
        bootstrap={bootstrap}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
        onSaved={invalidate}
      />

      <PrinterSetupCard
        bootstrap={bootstrap}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
        onChanged={invalidate}
      />

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

      <KitchensCountersCard
        bootstrap={bootstrap}
        unitName={unitName}
        setUnitName={setUnitName}
        createUnitPending={createUnit.isPending}
        onCreateUnit={() => createUnit.mutate()}
        invalidate={invalidate}
        setNotice={setNotice}
      />

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

      <DevicePairingCard
        devices={devices.data ?? []}
        loading={devices.isLoading}
        setNotice={setNotice}
        requestManagerApproval={requestManagerApproval}
        onChanged={async () => {
          await devices.refetch();
          await invalidate();
        }}
      />
    </div>
  );
}
