import type { KotType } from "@gaurav-pos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import { useHubStore } from "../../store.js";
import { EmptyState } from "../ui/empty-state.js";

export function KitchenView({
  bootstrap,
  setNotice,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const selectedKdsUnitId = useHubStore((state) => state.selectedKdsUnitId);
  const setSelectedKdsUnitId = useHubStore((state) => state.setSelectedKdsUnitId);
  const knownTicketIdsRef = useRef<{ unitId: string; ids: Set<string>; initialized: boolean }>({ unitId: "", ids: new Set(), initialized: false });
  const audioContextRef = useRef<AudioContext | null>(null);
  const kdsEnabled = bootstrap.setup?.kdsEnabled ?? true;
  const activeUnits = useMemo(
    () => kdsEnabled ? bootstrap.productionUnits.filter((unit) => unit.active && unit.kds_enabled !== false && unit.kds_enabled !== 0) : [],
    [bootstrap.productionUnits, kdsEnabled]
  );
  const selectedUnitIsActive = activeUnits.some((unit) => unit.id === selectedKdsUnitId);
  const unitId = selectedUnitIsActive ? selectedKdsUnitId ?? "" : activeUnits[0]?.id ?? "";

  useEffect(() => {
    if (!kdsEnabled) {
      if (selectedKdsUnitId) setSelectedKdsUnitId("");
      return;
    }
    if (selectedKdsUnitId !== unitId) setSelectedKdsUnitId(unitId);
  }, [kdsEnabled, selectedKdsUnitId, setSelectedKdsUnitId, unitId]);

  const tickets = useQuery({
    queryKey: ["kds", unitId],
    queryFn: () => hubApi.kds(unitId),
    enabled: Boolean(unitId) && kdsEnabled,
  });

  useEffect(() => {
    const unlockAudio = () => {
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      void context.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!kdsEnabled || !unitId) {
      knownTicketIdsRef.current = { unitId: "", ids: new Set(), initialized: false };
      return;
    }
    if (tickets.data === undefined) return;
    const nextTickets = tickets.data ?? [];
    const previous = knownTicketIdsRef.current.unitId === unitId ? knownTicketIdsRef.current.ids : new Set<string>();
    const initialized = knownTicketIdsRef.current.unitId === unitId && knownTicketIdsRef.current.initialized;
    const nextIds = new Set(nextTickets.map((ticket) => ticket.id));
    if (initialized && nextTickets.some((ticket) => !previous.has(ticket.id))) playKitchenChime(audioContextRef);
    knownTicketIdsRef.current = { unitId, ids: nextIds, initialized: Boolean(unitId) };
  }, [kdsEnabled, tickets.data, unitId]);

  const visibleTickets = kdsEnabled && unitId ? tickets.data ?? [] : [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      hubApi.updateKotStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kds", unitId] });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <div className="kitchen-layout">
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Kitchen queue</h2>
            <span className="kitchen-queue-summary">{visibleTickets.length} active ticket{visibleTickets.length === 1 ? "" : "s"}</span>
          </div>
          <div className="kitchen-station-picker">
          <label htmlFor="kitchen-station">Station</label>
          <select
            id="kitchen-station"
            value={unitId}
            onChange={(event) => setSelectedKdsUnitId(event.target.value)}
            disabled={!kdsEnabled || activeUnits.length === 0}
          >
            {activeUnits.length === 0 ? <option value="">{kdsEnabled ? "No kitchen" : "KDS off"}</option> : null}
            {activeUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          </div>
        </div>
        {!kdsEnabled ? (
          <EmptyState
            title="KDS is off"
            description="Turn on Kitchen Display in Setup."
          />
        ) : null}
        {kdsEnabled && !unitId ? (
          <EmptyState
            title="No kitchen added"
            description="Add a kitchen or counter in Setup."
          />
        ) : null}
        {kdsEnabled && unitId && tickets.isLoading ? (
          <div className="kot-load-state" role="status">Loading kitchen tickets…</div>
        ) : null}
        {kdsEnabled && unitId && tickets.isError ? (
          <div className="kitchen-error" role="alert">
            <span>{messageOf(tickets.error)}</span>
            <button type="button" disabled={tickets.isFetching} onClick={() => void tickets.refetch()}>{tickets.isFetching ? "Retrying…" : "Retry"}</button>
          </div>
        ) : null}
        {kdsEnabled && unitId && !tickets.isLoading && !tickets.isError && visibleTickets.length === 0 ? (
          <EmptyState title="All caught up" description="New kitchen tickets will appear here as orders are sent." />
        ) : null}
        <div className="kot-grid">
          {visibleTickets.map((ticket) => {
            const cancellation = ticket.type === "cancelled" || ticket.type === "partial_cancel" || (ticket.items.some((item) => item.quantity_delta < 0) && ticket.items.every((item) => item.quantity_delta <= 0));
            const acknowledgeOnly = cancellation || ticket.items.every((item) => item.quantity_delta === 0);
            const kind = ticket.type ? ticketLabels[ticket.type] : cancellation ? "Items cancelled" : "Kitchen ticket";
            const primaryStatus = ticket.status === "ready" ? "served" : "ready";
            return <article key={ticket.id} className={`kot-card${cancellation ? " cancellation" : ""}${acknowledgeOnly ? " acknowledge-only" : ""}`}>

              <header>
                <strong>
                  #{ticket.sequence} · {ticket.table_name}
                </strong>
                <div className="kot-ticket-kind"><strong>{kind}</strong><span>{acknowledgeOnly && ticket.status !== "served" ? "Needs acknowledgment" : ticket.status}</span></div>
              </header>
              <ul>
                {ticket.note ? <li className="kot-note">Note: {ticket.note}</li> : null}
                {ticket.items.map((item, index) => (
                  <li key={`${item.name_snapshot}-${index}`} className={`kot-change-row${item.quantity_delta < 0 ? " removal" : ""}`}>
                    <span className="kot-item-change">{item.quantity_delta < 0 ? `Remove ${Math.abs(item.quantity_delta)} ×` : item.quantity_delta === 0 ? item.note_snapshot ? "Note updated" : "Note cleared" : `Add ${item.quantity_delta} ×`}</span>
                    <div><span>{item.name_snapshot}</span>{item.note_snapshot ? <small className="kot-note">{item.note_snapshot}</small> : null}</div>
                  </li>
                ))}
              </ul>
              <footer>
                {acknowledgeOnly ? <button type="button" className="kot-acknowledge-button" aria-label={`Acknowledge ticket ${ticket.sequence}${cancellation ? " cancellation" : " changes"}`} disabled={ticket.status === "served" || statusMutation.isPending} onClick={() => statusMutation.mutate({ id: ticket.id, status: "served" })}>{statusMutation.isPending && statusMutation.variables?.id === ticket.id ? "Saving…" : "Acknowledge"}</button> : ["preparing", "ready", "served"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`kot-status-button ${status}${status === primaryStatus ? " kot-next-action" : ""}`}
                    aria-label={`Mark ticket ${ticket.sequence} ${status}`}
                    aria-pressed={ticket.status === status}
                    disabled={
                      ticket.status === status || statusMutation.isPending
                    }
                    onClick={() =>
                      statusMutation.mutate({ id: ticket.id, status })
                    }
                  >
                    {statusMutation.isPending && statusMutation.variables?.id === ticket.id && statusMutation.variables.status === status ? "Saving…" : status === "preparing" ? "Start" : status === "ready" ? "Ready" : "Served"}
                  </button>
                ))}
              </footer>
            </article>;
          })}
        </div>
      </section>
    </div>
  );
}

function playKitchenChime(audioContextRef: MutableRefObject<AudioContext | null>) {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    const ring = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    };
    if (context.state === "suspended") {
      void context.resume().then(ring).catch(() => undefined);
      return;
    }
    ring();
  } catch {
    // Browsers may block audio until a user gesture; the next kitchen interaction can unlock it.
  }
}

const ticketLabels: Record<KotType, string> = {
  new: "New order", modified: "Modified order", partial_cancel: "Items cancelled",
  cancelled: "Order cancelled", table_shifted: "Table moved", reprint: "Reprint",
};
