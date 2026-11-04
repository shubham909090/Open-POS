import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react";

export const SettingsPageContext = createContext(false);
export const SettingsPageActiveContext = createContext(true);

export function SetupCard({
  title,
  done,
  icon,
  children,
  summary,
  defaultOpen,
}: {
  title: string;
  done: boolean;
  icon: ReactNode;
  children?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? !done);
  const embedded = useContext(SettingsPageContext);
  const contentId = useId();
  if (embedded) return <section className="setup-section" aria-label={title}>{children}</section>;
  const heading = (
    <>
      <div className="setup-heading">
        <div className="setup-icon">{icon}</div>
        <div>
          <span className="setup-title">{title}</span>
          {summary ? <span className="setup-summary">{summary}</span> : null}
        </div>
      </div>
      <div className="setup-card-meta">
        {!embedded && children ? (
          <span className="setup-card-toggle">{open ? "Hide" : "Open"}</span>
        ) : null}
      </div>
    </>
  );

  return (
    <section className={done ? "setup-card done" : "setup-card"}>
      {embedded || !children ? (
        <div className="setup-card-header static">{heading}</div>
      ) : (
        <button
          type="button"
          className="setup-card-header"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={contentId}
        >
          {heading}
        </button>
      )}
      {(embedded || open) && children ? (
        <div id={contentId} className="setup-card-content">
          {children}
        </div>
      ) : null}
    </section>
  );
}
