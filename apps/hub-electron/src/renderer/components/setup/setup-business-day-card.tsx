import { CalendarCheck } from "lucide-react";
import type { Bootstrap } from "../../hub-api.js";
import { SetupCard } from "./setup-card.js";

export function BusinessDayCard({ bootstrap }: { bootstrap: Bootstrap }) {
  return (
    <SetupCard
      title="Business Day"
      done
      icon={<CalendarCheck size={20} />}
      summary={`${bootstrap.currentBusinessDay.business_date} · rolls over at 6:00 AM IST`}
      defaultOpen={false}
    />
  );
}
