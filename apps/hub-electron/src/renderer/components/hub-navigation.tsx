import { useEffect, useState } from "react";
import {
  BadgeIndianRupee,
  ChefHat,
  ChevronRight,
  Command,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Wine,
} from "lucide-react";
import type { HubView } from "../store.js";
import { useKeyboardListNavigation } from "../hooks/use-keyboard-list-navigation.js";
import { Button } from "./ui/button.js";
import { Dialog } from "./ui/dialog.js";

export const hubNavigation = [
  {
    view: "orders",
    label: "Orders",
    description: "Tables, menu and billing",
    icon: ReceiptText,
    group: "Service",
    keywords: "take order bill table check",
  },
  {
    view: "kitchen",
    label: "Kitchen",
    description: "Live kitchen and counter tickets",
    icon: ChefHat,
    group: "Service",
    keywords: "kot bot preparation ready",
  },
  {
    view: "alcohol",
    label: "Alcohol",
    description: "Catalog and stock movements",
    icon: Wine,
    group: "Management",
    keywords: "liquor inventory stock bottle",
  },
  {
    view: "reports",
    label: "Reports",
    description: "Sales, payments and history",
    icon: BadgeIndianRupee,
    group: "Management",
    keywords: "history export sales tally business day",
  },
  {
    view: "setup",
    label: "Settings",
    description: "Restaurant, printers and staff devices",
    icon: Settings2,
    group: "Configuration",
    keywords: "setup printer qr floor menu dish payment device",
  },
  {
    view: "advanced",
    label: "Administration",
    description: "Security, backups and updates",
    icon: ShieldCheck,
    group: "Configuration",
    keywords: "advanced master pin manager backup update tax reset",
  },
] as const satisfies ReadonlyArray<{
  view: HubView;
  label: string;
  description: string;
  icon: typeof ReceiptText;
  group: string;
  keywords: string;
}>;

export function HubNavigation({
  view,
  onChange,
  unlocked,
  managerPinConfigured,
  onUnlock,
  onLock,
}: {
  view: HubView;
  onChange: (view: HubView) => void;
  unlocked: boolean;
  managerPinConfigured: boolean;
  onUnlock: () => void;
  onLock: () => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hub-sidebar-collapsed") === "true",
  );
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setSearchOpen((value) => !value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <>
      <aside
        className={`side-rail${collapsed ? " collapsed" : ""}`}
        aria-label="Main navigation"
      >
        <div className="workspace-brand">
          <span className="workspace-monogram" aria-hidden="true">
            g.
          </span>
          <div className="workspace-brand-copy">
            <strong>Gaurav</strong>
            <span>Restaurant workspace</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rail-collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              localStorage.setItem("hub-sidebar-collapsed", String(next));
            }}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </Button>
        </div>
        <button
          type="button"
          className="workspace-search"
          onClick={() => setSearchOpen(true)}
          title="Go to a page (⌘K / Ctrl+K)"
        >
          <Search size={15} />
          <span>Go to…</span>
          <kbd>⌘K</kbd>
        </button>
        <nav aria-label="Hub sections">
          {["Service", "Management", "Configuration"].map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-group-label">{group}</p>
              {hubNavigation
                .filter((item) => item.group === group)
                .map(({ view: target, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={target}
                    className={`nav-button${view === target ? " active" : ""}`}
                    aria-current={view === target ? "page" : undefined}
                    title={label}
                    onClick={() => onChange(target)}
                  >
                    <Icon size={17} strokeWidth={1.7} />
                    <span>{label}</span>
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="rail-session">
          <div className="rail-session-copy">
            <LockKeyhole size={14} />
            <span>{unlocked ? "Hub unlocked" : "Hub locked"}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              unlocked
                ? "Lock hub"
                : managerPinConfigured
                  ? "Unlock setup"
                  : "Create PIN"
            }
            onClick={unlocked ? onLock : onUnlock}
          >
            {unlocked ? "Lock" : managerPinConfigured ? "Unlock" : "Set PIN"}
          </Button>
        </div>
      </aside>
      {searchOpen && (
        <WorkspaceSearch
          onClose={() => setSearchOpen(false)}
          onChange={onChange}
        />
      )}
    </>
  );
}

function WorkspaceSearch({
  onClose,
  onChange,
}: {
  onClose: () => void;
  onChange: (view: HubView) => void;
}) {
  const [query, setQuery] = useState("");
  const results = hubNavigation.filter((item) =>
    `${item.label} ${item.description} ${item.keywords}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const navigate = (item: (typeof hubNavigation)[number]) => {
    onChange(item.view);
    onClose();
  };
  const { activeIndex, onKeyDown, setActiveIndex } = useKeyboardListNavigation({
    items: results,
    resetKey: query,
    onCommit: navigate,
  });
  return (
    <Dialog
      open
      title="Go to a page"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="command-search-field">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search pages"
          role="combobox"
          aria-expanded
          aria-controls="workspace-results"
          aria-activedescendant={
            results[activeIndex]
              ? `workspace-result-${results[activeIndex].view}`
              : undefined
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tables, printers, reports…"
        />
      </div>
      <div
        id="workspace-results"
        role="listbox"
        aria-label="Pages"
        className="workspace-results"
      >
        {results.map((item, index) => (
          <button
            id={`workspace-result-${item.view}`}
            role="option"
            aria-selected={index === activeIndex}
            key={item.view}
            className={`workspace-result${index === activeIndex ? " selected" : ""}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => navigate(item)}
          >
            <item.icon size={19} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <ChevronRight size={14} />
          </button>
        ))}
        {!results.length && (
          <p className="command-empty">
            No pages match “{query}”. Try a different name.
          </p>
        )}
      </div>
      <p className="command-hint">
        <Command size={12} /> <span>↑ ↓ to move</span>
        <span>Enter to open</span>
        <span>Esc to close</span>
      </p>
    </Dialog>
  );
}

export function HubLoading() {
  return (
    <div className="hub-loading" role="status" aria-label="Loading workspace">
      <span className="loading-line" />
      <span className="loading-line short" />
      <div className="loading-grid">
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
