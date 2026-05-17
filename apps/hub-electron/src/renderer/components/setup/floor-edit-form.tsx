import { useState } from "react";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { hubApi, type Floor } from "../../hub-api.js";

export function FloorEditForm({
  floor,
  onSaved,
  setNotice,
}: {
  floor: Floor;
  onSaved: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [name, setName] = useState(floor.name);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="row-edit-form floor-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        hubApi
          .updateFloor(floor.id, { name })
          .then(onSaved)
          .then(() => setNotice({ tone: "good", text: "Floor updated." }))
          .catch((error) =>
            setNotice({ tone: "bad", text: messageOf(error) }),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="row-edit-fields">
        <label>
          Floor name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>
      <div className="row-edit-actions">
        <button type="submit" disabled={!name.trim() || saving}>
          Save floor
        </button>
      </div>
    </form>
  );
}
