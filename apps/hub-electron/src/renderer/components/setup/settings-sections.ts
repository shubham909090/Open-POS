import {
  CalendarDays,
  ChefHat,
  Cloud,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  ListTree,
  Printer,
  QrCode,
  ReceiptText,
  ShieldAlert,
  Smartphone,
  Utensils,
  Download,
} from "lucide-react";
import type { SettingsSection } from "./settings-workspace.js";

export const setupSections = [
  {
    id: "general",
    title: "General",
    description:
      "Restaurant name and logo, business day and kitchen display preferences.",
    group: "Restaurant",
    keywords: "restaurant name logo brand identity bill header business day date rollover kds served kitchen operation",
    icon: CalendarDays,
  },
  {
    id: "floor-plan",
    title: "Floors & tables",
    description:
      "Organize the dining room, table names and the order staff see them in.",
    group: "Restaurant",
    keywords: "floor hall table position active",
    icon: LayoutGrid,
  },
  {
    id: "menu",
    title: "Menu",
    description:
      "Manage dishes, prices and availability, or import your menu from a CSV file.",
    group: "Restaurant",
    keywords: "dish food price import csv active disabled category",
    icon: Utensils,
  },
  {
    id: "stations",
    title: "Kitchen stations",
    description:
      "Route items to the right kitchen or counter and configure station printing.",
    group: "Restaurant",
    keywords: "kitchen counter production unit kot bot printer",
    icon: ChefHat,
  },
  {
    id: "printers",
    title: "Printers & receipts",
    description:
      "Choose bill printers, test the output and fine-tune receipt and kitchen layouts.",
    group: "Devices & payments",
    keywords:
      "printer receipt bill kot text font size layout usb network lan test",
    icon: Printer,
  },
  {
    id: "payment",
    title: "Payment QR",
    description:
      "One reusable payment QR for customer bills and every paired staff phone.",
    group: "Devices & payments",
    keywords:
      "payment qr upi gpay google pay upload replace download master pin size",
    icon: QrCode,
  },
  {
    id: "devices",
    title: "Staff devices",
    description:
      "Pair staff phones with the right role and manage their access to this hub.",
    group: "Devices & payments",
    keywords: "device pair phone captain waiter kitchen scan qr revoke",
    icon: Smartphone,
  },
  {
    id: "cloud",
    title: "Cloud connection",
    description:
      "Manage this hub’s cloud connection, license and optional cloud backup.",
    group: "Connection",
    keywords: "cloud url license backup secret security sync activation",
    icon: Cloud,
  },
] as const satisfies readonly SettingsSection[];

export const advancedSections = [
  {
    id: "security",
    title: "Security",
    description:
      "Keep routine approvals and owner-only changes behind separate PINs.",
    group: "Administration",
    keywords: "manager master pin owner approval password",
    icon: KeyRound,
  },
  {
    id: "tax",
    title: "Sale & tax categories",
    description: "Configure sale categories and the tax rates applied to them.",
    group: "Administration",
    keywords: "sale tax gst cgst sgst category food alcohol beverage",
    icon: ListTree,
  },
  {
    id: "support",
    title: "Sync & support",
    description: "Check cloud updates and resolve failed setup commands.",
    group: "Maintenance",
    keywords: "support cloud sync failed retry updates resolve",
    icon: LifeBuoy,
  },
  {
    id: "print-queue",
    title: "Print queue",
    description:
      "Inspect recent print jobs and retry processing queued output.",
    group: "Maintenance",
    keywords: "print jobs failed queue attempts printer",
    icon: ReceiptText,
  },
  {
    id: "updates",
    title: "App updates",
    description: "Check the hub version, update readiness and rollback status.",
    group: "Maintenance",
    keywords: "app version update install rollback release backup",
    icon: Download,
  },
  {
    id: "reset",
    title: "Reset hub",
    description:
      "Start again on this PC. Review the consequences before continuing.",
    group: "Danger zone",
    keywords: "danger reset delete database backup restart",
    icon: ShieldAlert,
  },
] as const satisfies readonly SettingsSection[];
