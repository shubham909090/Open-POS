import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
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
  const activeUnits = bootstrap.productionUnits.filter((unit) => unit.active && Boolean(unit.kds_enabled));
  const unitId = selectedKdsUnitId ?? activeUnits[0]?.id ?? "";

  useEffect(() => {
    if (!selectedKdsUnitId && activeUnits[0]) setSelectedKdsUnitId(activeUnits[0].id);
  }, [selectedKdsUnitId, activeUnits, setSelectedKdsUnitId]);

  const tickets = useQuery({
    queryKey: ["kds", unitId],
    queryFn: () => hubApi.kds(unitId),
    enabled: Boolean(unitId),
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
    if (tickets.data === undefined) return;
    const nextTickets = tickets.data ?? [];
    const previous = knownTicketIdsRef.current.unitId === unitId ? knownTicketIdsRef.current.ids : new Set<string>();
    const initialized = knownTicketIdsRef.current.unitId === unitId && knownTicketIdsRef.current.initialized;
    const nextIds = new Set(nextTickets.map((ticket) => ticket.id));
    if (initialized && nextTickets.some((ticket) => !previous.has(ticket.id))) playKitchenChime(audioContextRef);
    knownTicketIdsRef.current = { unitId, ids: nextIds, initialized: Boolean(unitId) };
  }, [tickets.data, unitId]);

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
          <h2>Kitchen screen</h2>
          <select
            value={unitId}
            onChange={(event) => setSelectedKdsUnitId(event.target.value)}
          >
            {activeUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>
        {!unitId ? (
          <EmptyState
            title="No kitchen added"
            description="Add a kitchen or counter in Setup."
          />
        ) : null}
        <div className="kot-grid">
          {(tickets.data ?? []).map((ticket) => (
            <article key={ticket.id} className="kot-card">
              <header>
                <strong>
                  #{ticket.sequence} · {ticket.table_name}
                </strong>
                <span>{ticket.status}</span>
              </header>
              <ul>
                {ticket.note ? <li className="kot-note">Note: {ticket.note}</li> : null}
                {ticket.items.map((item, index) => (
                  <li key={`${item.name_snapshot}-${index}`}>
                    {item.quantity_delta === 0 ? item.name_snapshot : `${item.quantity_delta} x ${item.name_snapshot}`}
                    {item.note_snapshot ? <small className="kot-note">Note: {item.note_snapshot}</small> : null}
                  </li>
                ))}
              </ul>
              <footer>
                {["preparing", "ready", "served"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`kot-status-button ${status}`}
                    disabled={
                      ticket.status === status || statusMutation.isPending
                    }
                    onClick={() =>
                      statusMutation.mutate({ id: ticket.id, status })
                    }
                  >
                    {status}
                  </button>
                ))}
              </footer>
            </article>
          ))}
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
