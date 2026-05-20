import { Alert } from "react-native";

import type { HubClient } from "../lib/hub-client";
import type { BillPrinterSlot } from "../lib/mobile-types";

function describeBillPrinter(profile: { printerMode: "system" | "network"; printerName: string | null; printerHost: string | null; printerPort: number | null }): string {
  if (profile.printerMode === "network") return profile.printerHost ? `${profile.printerHost}:${profile.printerPort ?? 9100}` : "Not configured";
  return profile.printerName || "Not configured";
}

export function useBillPrinterChooser({ client, setMessage }: { client: HubClient; setMessage: (value: string) => void }) {
  async function chooseBillPrinter(title: string): Promise<BillPrinterSlot | null> {
    try {
      const printers = await client.billPrinters();
      const hasAnyPrinter = printers.default.configured || printers.alternate.configured;
      if (!hasAnyPrinter) {
        Alert.alert("Bill printer missing", "No bill printer is configured in Hub Setup.");
        return null;
      }
      return await new Promise<BillPrinterSlot | null>((resolve) => {
        const buttons = [
          ...(printers.default.configured
            ? [{ text: `${printers.default.label}\n${describeBillPrinter(printers.default)}`, onPress: () => resolve("default" as const) }]
            : []),
          ...(printers.alternate.configured
            ? [{ text: `${printers.alternate.label}\n${describeBillPrinter(printers.alternate)}`, onPress: () => resolve("alternate" as const) }]
            : []),
          { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) }
        ];
        Alert.alert(title, printers.default.configured && printers.alternate.configured ? "Choose where to print this bill." : "Only one bill printer is configured.", buttons);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load bill printers.");
      return null;
    }
  }

  return { chooseBillPrinter };
}
