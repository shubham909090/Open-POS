import type { FormEvent } from "react";

import { commandTypes, type CommandType } from "../../lib/cloud-format";

export function AdvancedSection({
  canManage,
  commandType,
  payloadJson,
  commands,
  onCommandTypeChange,
  onPayloadChange,
  onQueue
}: {
  canManage: boolean;
  commandType: CommandType;
  payloadJson: string;
  commands: Array<{ commandId: string; type: CommandType; payloadJson: string; createdAt: string }>;
  onCommandTypeChange: (value: CommandType) => void;
  onPayloadChange: (value: string) => void;
  onQueue: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="command-layout">
      <section className="admin-panel">
        <span className="eyebrow">Advanced</span>
        <h2>Support command</h2>
        <p>Normal restaurants should not need this. Use only for support or imports.</p>
        <form className="admin-form" onSubmit={onQueue}>
          <label className="field-label">
            Command
            <select value={commandType} onChange={(event) => onCommandTypeChange(event.target.value as CommandType)}>
              {commandTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="field-label">
            Raw support payload
            <textarea value={payloadJson} onChange={(event) => onPayloadChange(event.target.value)} spellCheck={false} />
          </label>
          <button type="submit" disabled={!canManage}>Queue for hub</button>
        </form>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">History</span>
        <h2>Recent commands</h2>
        <div className="stack-list">
          {commands.map((command) => (
            <article key={command.commandId} className="list-row">
              <strong>{command.type}</strong>
              <span>{new Date(command.createdAt).toLocaleString()}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
