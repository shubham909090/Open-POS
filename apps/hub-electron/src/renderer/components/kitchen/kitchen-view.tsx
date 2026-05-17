import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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
                {ticket.items.map((item, index) => (
                  <li key={`${item.name_snapshot}-${index}`}>
                    {item.quantity_delta} x {item.name_snapshot}
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
