import type { Dispatch, SetStateAction } from "react";

import type { HubClient, KdsTicket } from "../lib/hub-client";
import type { ConnectionState } from "../lib/mobile-types";

type UseKitchenActionsInput = {
  client: HubClient;
  connection: ConnectionState;
  kitchenUnitId: string;
  setKitchenUnitId: Dispatch<SetStateAction<string>>;
  setKdsTickets: Dispatch<SetStateAction<KdsTicket[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  chimeForNewKdsTickets: (unitId: string, nextTickets: KdsTicket[]) => void;
};

export function useKitchenActions({
  client,
  connection,
  kitchenUnitId,
  setKitchenUnitId,
  setKdsTickets,
  setLoading,
  setSending,
  setMessage,
  chimeForNewKdsTickets,
}: UseKitchenActionsInput) {
  async function selectKitchenUnit(unitId: string) {
    setKitchenUnitId(unitId);
    if (connection !== "online") return;
    try {
      setLoading(true);
      const tickets = await client.kds(unitId);
      chimeForNewKdsTickets(unitId, tickets);
      setKdsTickets(tickets);
      setMessage("Kitchen tickets refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load kitchen tickets.");
    } finally {
      setLoading(false);
    }
  }

  async function changeKotStatus(kotId: string, status: "preparing" | "ready" | "served") {
    if (!kitchenUnitId) {
      setMessage("Choose a kitchen counter first.");
      return;
    }
    try {
      setSending(true);
      await client.updateKotStatus(kotId, status);
      setKdsTickets(await client.kds(kitchenUnitId));
      setMessage(status === "ready" ? "Ticket marked ready. Captain has been notified." : `Ticket marked ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update kitchen ticket.");
    } finally {
      setSending(false);
    }
  }

  return { selectKitchenUnit, changeKotStatus };
}
