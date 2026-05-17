import type { Section } from "../lib/cloud-types";

function RailButton({ section, active, setSection, label }: { section: Section; active: Section; setSection: (section: Section) => void; label: string }) {
  return (
    <button type="button" className={active === section ? "rail-button active" : "rail-button"} onClick={() => setSection(section)}>
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export { EmptyState, Metric, RailButton };
