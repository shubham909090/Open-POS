import { CalendarCheck } from "lucide-react";
import type { Bootstrap } from "../../hub-api.js";
import { SetupCard } from "./setup-card.js";

export function BusinessDayCard({ bootstrap }: { bootstrap: Bootstrap }) {
  return (
    <SetupCard
      title="Business day"
      done
      icon={<CalendarCheck size={20} />}
      summary={`${bootstrap.currentBusinessDay.business_date} · rolls over at 6:00 AM IST`}
    >
      <div className="settings-info-row">
        <div>
          <h3>Current business date</h3>
          <p>Orders, bills and reports are grouped under this date.</p>
        </div>
        <strong>{bootstrap.currentBusinessDay.business_date}</strong>
      </div>
      <div className="settings-info-row">
        <div>
          <h3>Automatic rollover</h3>
          <p>
            A new business day starts at 6:00 AM India time. Service after
            midnight stays on the previous day.
          </p>
        </div>
        <strong>6:00 AM IST</strong>
      </div>
    </SetupCard>
  );
}
