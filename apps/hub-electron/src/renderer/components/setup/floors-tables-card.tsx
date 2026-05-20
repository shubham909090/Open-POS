import { Users } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import type { NoticeSetter } from "../../lib/format.js";
import { EditableRecordList } from "./editable-record-list.js";
import { FloorEditForm } from "./floor-edit-form.js";
import { SetupCard } from "./setup-card.js";
import { TableEditForm } from "./table-edit-form.js";

type SaveCallback = () => Promise<void>;

export function FloorsTablesCard({
  bootstrap,
  activeFloors,
  firstFloorId,
  floorName,
  setFloorName,
  tableName,
  setTableName,
  tableFloorId,
  setTableFloorId,
  createFloorPending,
  createTablePending,
  onCreateFloor,
  onCreateTable,
  invalidate,
  setNotice,
}: {
  bootstrap: Bootstrap;
  activeFloors: Bootstrap["floors"];
  firstFloorId: string;
  floorName: string;
  setFloorName: Dispatch<SetStateAction<string>>;
  tableName: string;
  setTableName: Dispatch<SetStateAction<string>>;
  tableFloorId: string;
  setTableFloorId: Dispatch<SetStateAction<string>>;
  createFloorPending: boolean;
  createTablePending: boolean;
  onCreateFloor: () => void;
  onCreateTable: () => void;
  invalidate: SaveCallback;
  setNotice: NoticeSetter;
}) {
  const orderedFloors = bootstrap.floors;
  const floorIndexById = new Map(orderedFloors.map((floor, index) => [floor.id, index]));
  const tablesByFloor = new Map<string, Bootstrap["tables"]>();
  for (const table of bootstrap.tables) {
    const floorTables = tablesByFloor.get(table.floor_id) ?? [];
    floorTables.push(table);
    tablesByFloor.set(table.floor_id, floorTables);
  }

  const tableIndexKey = (tableId: string, floorId: string) => {
    const floorTables = tablesByFloor.get(floorId) ?? [];
    const index = floorTables.findIndex((table) => table.id === tableId);
    return { floorTables, index };
  };

  const persistFloorOrder = async (nextFloors: Bootstrap["floors"]) => {
    await Promise.all(nextFloors.map((floor, index) => hubApi.updateFloor(floor.id, { sortOrder: index })));
    await invalidate();
  };

  const moveFloor = async (floorId: string, direction: -1 | 1) => {
    const index = floorIndexById.get(floorId) ?? -1;
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedFloors.length) return;
    const nextFloors = [...orderedFloors];
    const currentFloor = nextFloors[index];
    const targetFloor = nextFloors[targetIndex];
    if (!currentFloor || !targetFloor) return;
    nextFloors[index] = targetFloor;
    nextFloors[targetIndex] = currentFloor;
    await persistFloorOrder(nextFloors);
  };

  const persistTableOrder = async (nextTables: Bootstrap["tables"]) => {
    await Promise.all(nextTables.map((table, index) => hubApi.updateTable(table.id, { sortOrder: index })));
    await invalidate();
  };

  const moveTable = async (tableId: string, floorId: string, direction: -1 | 1) => {
    const { floorTables, index } = tableIndexKey(tableId, floorId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= floorTables.length) return;
    const nextTables = [...floorTables];
    const currentTable = nextTables[index];
    const targetTable = nextTables[targetIndex];
    if (!currentTable || !targetTable) return;
    nextTables[index] = targetTable;
    nextTables[targetIndex] = currentTable;
    await persistTableOrder(nextTables);
  };

  return (
    <SetupCard
      title="Floors And Tables"
      done={bootstrap.tables.some((table) => table.active)}
      icon={<Users size={20} />}
      summary={`${bootstrap.tables.filter((table) => table.active).length} active tables`}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateFloor();
        }}
      >
        <label>
          Floor name
          <input value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Main hall" />
        </label>
        <button disabled={!floorName.trim() || createFloorPending} type="submit">
          Add floor
        </button>
      </form>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateTable();
        }}
      >
        <label>
          Floor
          <select value={tableFloorId} onChange={(event) => setTableFloorId(event.target.value)}>
            {activeFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Table name
          <input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="T1" />
        </label>
        <button disabled={!firstFloorId || !tableName.trim() || createTablePending} type="submit">
          Add table
        </button>
      </form>
      <EditableRecordList
        setNotice={setNotice}
        rows={bootstrap.tables.map((table) => {
          const { floorTables, index } = tableIndexKey(table.id, table.floor_id);
          return {
            id: table.id,
            title: table.name,
            meta: `${table.floor_name} · position ${index + 1} · ${table.active ? table.status : "disabled"}`,
            active: table.active,
            onMoveUp: () => moveTable(table.id, table.floor_id, -1),
            onMoveDown: () => moveTable(table.id, table.floor_id, 1),
            moveUpDisabled: index <= 0,
            moveDownDisabled: index < 0 || index >= floorTables.length - 1,
            onToggle: () => hubApi.updateTable(table.id, { active: !table.active }).then(invalidate),
            onDelete: () => hubApi.deleteTable(table.id).then(invalidate),
            editForm: (close: () => void) => (
              <TableEditForm
                table={table}
                floors={activeFloors}
                onSaved={async () => {
                  close();
                  await invalidate();
                }}
                setNotice={setNotice}
              />
            ),
          };
        })}
      />
      <EditableRecordList
        setNotice={setNotice}
        rows={orderedFloors.map((floor) => {
          const index = floorIndexById.get(floor.id) ?? -1;
          return {
            id: floor.id,
            title: floor.name,
            meta: `Position ${index + 1} · ${floor.active ? "Floor active" : "Floor disabled"}`,
            active: floor.active,
            onMoveUp: () => moveFloor(floor.id, -1),
            onMoveDown: () => moveFloor(floor.id, 1),
            moveUpDisabled: index <= 0,
            moveDownDisabled: index < 0 || index >= orderedFloors.length - 1,
            onToggle: () => hubApi.updateFloor(floor.id, { active: !floor.active }).then(invalidate),
            onDelete: () => hubApi.deleteFloor(floor.id).then(invalidate),
            editForm: (close: () => void) => (
              <FloorEditForm
                floor={floor}
                onSaved={async () => {
                  close();
                  await invalidate();
                }}
                setNotice={setNotice}
              />
            ),
          };
        })}
      />
    </SetupCard>
  );
}
