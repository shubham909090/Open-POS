import { Search, X, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  SettingsPageActiveContext,
  SettingsPageContext,
} from "./setup-card.js";

export interface SettingsSection<Id extends string = string> {
  id: Id;
  title: string;
  description: string;
  group: string;
  keywords: string;
  icon: LucideIcon;
}

export function SettingsWorkspace<Id extends string>({
  title,
  storageKey,
  sections,
  renderSection,
}: {
  title: string;
  storageKey: string;
  sections: readonly SettingsSection<Id>[];
  renderSection: (id: Id) => ReactNode;
}) {
  const [selected, setSelected] = useState<Id>(() => {
    const saved = window.localStorage.getItem(storageKey);
    return (
      sections.find((section) => section.id === saved)?.id ?? sections[0]!.id
    );
  });
  const [visited, setVisited] = useState<Id[]>([selected]);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const current = sections.find((section) => section.id === selected)!;
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleSections = sections.filter((section) =>
    terms.every((term) =>
      `${section.title} ${section.description} ${section.keywords}`
        .toLowerCase()
        .includes(term),
    ),
  );
  // An explicit setting title should win over a related station's keywords.
  visibleSections.sort((a, b) => Number(!terms.every((term) => a.title.toLowerCase().includes(term))) - Number(!terms.every((term) => b.title.toLowerCase().includes(term))));
  const groups = [...new Set(visibleSections.map((section) => section.group))];

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='dialog']"))
      )
        return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function select(id: Id) {
    if (id !== selected) window.scrollTo({ top: 0, behavior: "instant" });
    setSelected(id);
    setVisited((value) => (value.includes(id) ? value : [...value, id]));
    window.localStorage.setItem(storageKey, id);
  }

  function navigateByKey(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      navigation.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-settings-section]",
      ) ?? [],
    );
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !buttons.length) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div className="settings-workspace">
      <aside className="settings-navigation">
        <label className="settings-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchInput}
            value={search}
            placeholder="Search settings"
            aria-label={`Search ${title.toLowerCase()}`}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
                searchInput.current?.blur();
              }
              if (event.key === "Enter" && visibleSections[0])
                select(visibleSections[0].id);
            }}
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear settings search"
              onClick={() => {
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
        <nav
          ref={navigation}
          aria-label={`${title} sections`}
          onKeyDown={navigateByKey}
        >
          {groups.map((group) => (
            <div className="settings-nav-group" key={group}>
              <p>{group}</p>
              {visibleSections
                .filter((section) => section.group === group)
                .map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      data-settings-section
                      type="button"
                      className={
                        selected === section.id
                          ? "settings-nav-item active"
                          : "settings-nav-item"
                      }
                      aria-current={
                        selected === section.id ? "page" : undefined
                      }
                      onClick={() => select(section.id)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{section.title}</span>
                    </button>
                  );
                })}
            </div>
          ))}
          {visibleSections.length === 0 && (
            <p className="settings-search-empty" role="status">
              No settings match “{search}”. Try printer, menu or PIN.
            </p>
          )}
        </nav>
      </aside>
      <div className="settings-content">
        <header className="settings-page-heading">
          <h2>{current.title}</h2>
        </header>
        <SettingsPageContext.Provider value>
          {visited.map((id) => (
            <SettingsPageActiveContext.Provider
              key={id}
              value={id === selected}
            >
              <div
                className="settings-view-panel"
                hidden={id !== selected}
                aria-label={
                  sections.find((section) => section.id === id)?.title
                }
              >
                {renderSection(id)}
              </div>
            </SettingsPageActiveContext.Provider>
          ))}
        </SettingsPageContext.Provider>
      </div>
    </div>
  );
}
