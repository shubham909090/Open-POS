import { useEffect, useRef } from "react";
import { Vibration } from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";

import type { KdsTicket } from "../lib/hub-client";
import { POS_CHIME_SOURCE } from "../lib/pos-chime";

export function useMobileChime() {
  const chimePlayer = useAudioPlayer(POS_CHIME_SOURCE, { updateInterval: 1000 });
  const knownKdsTicketIdsRef = useRef<{ unitId: string; ids: Set<string>; initialized: boolean }>({ unitId: "", ids: new Set(), initialized: false });

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => undefined);
  }, []);

  function notifyChime() {
    void chimePlayer.seekTo(0).then(() => chimePlayer.play()).catch(() => undefined);
    Vibration.vibrate([0, 180, 80, 180]);
  }

  function chimeForNewKdsTickets(unitId: string, nextTickets: KdsTicket[]) {
    const previous = knownKdsTicketIdsRef.current.unitId === unitId ? knownKdsTicketIdsRef.current.ids : new Set<string>();
    const initialized = knownKdsTicketIdsRef.current.unitId === unitId && knownKdsTicketIdsRef.current.initialized;
    const nextIds = new Set(nextTickets.map((ticket) => ticket.id));
    if (initialized && nextTickets.some((ticket) => !previous.has(ticket.id))) notifyChime();
    knownKdsTicketIdsRef.current = { unitId, ids: nextIds, initialized: Boolean(unitId) };
  }

  return { notifyChime, chimeForNewKdsTickets };
}
