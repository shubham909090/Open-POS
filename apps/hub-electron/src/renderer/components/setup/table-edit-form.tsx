import { useState } from "react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { hubApi, type Floor, type Table } from "../../hub-api.js";

export function TableEditForm({
  table,
  floors,
  onSaved,
  setNotice,
}: {
  table: Table;
  floors: Floor[];
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(table.name);
  const [floorId, setFloorId] = useState(table.floor_id);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="row-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi
          .updateTable(table.id, { name, floorId })
          .then(onSaved)
          .then(() => setNotice({ tone: "good", text: "Table updated." }))
          .catch((error) =>
            setNotice({ tone: "bad", text: messageOf(error) }),
          )
          .finally(() => setSaving(false));
      }}
    >
      <label>
        Table name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Floor
        <select
          value={floorId}
          onChange={(event) => setFloorId(event.target.value)}
        >
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!name.trim() || !floorId || saving}>
        Save
      </button>
    </form>
  );
}
