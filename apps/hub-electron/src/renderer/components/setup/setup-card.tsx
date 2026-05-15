import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "../ui/badge.js";

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
  const [wasDone, setWasDone] = useState(done);

  useEffect(() => {
    if (done && !wasDone && defaultOpen === undefined) setOpen(false);
    setWasDone(done);
  }, [defaultOpen, done, wasDone]);

  return (
    <section className={done ? "setup-card done" : "setup-card"}>
      <button
        type="button"
        className="setup-card-header"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="setup-heading">
          <div className="setup-icon">{icon}</div>
          <div>
            <span className="setup-title">{title}</span>
            {summary ? <span className="setup-summary">{summary}</span> : null}
          </div>
        </div>
        <div className="setup-card-meta">
          <Badge className={done ? "setup-status ready" : "setup-status"}>
            {done ? "Ready" : "Needs setup"}
          </Badge>
          <span className="setup-card-toggle">{open ? "Hide" : "Open"}</span>
        </div>
      </button>
      {open && children ? <div className="setup-card-content">{children}</div> : null}
    </section>
  );
}
