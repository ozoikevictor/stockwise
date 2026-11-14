import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";

const OPTS: { k: RangeKey; l: string }[] = [
  { k: "today", l: "Today" }, { k: "yesterday", l: "Yesterday" }, { k: "week", l: "This week" }, { k: "lastweek", l: "Last week" }, { k: "month", l: "This month" }, { k: "lastmonth", l: "Last month" },
];

export function RangeFilter({ value, onChange, custom, onCustom }: {
  value: RangeKey; onChange: (k: RangeKey) => void; custom?: DateRange | undefined; onCustom: (r: DateRange | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1">
      {OPTS.map((o) => (
        <button key={o.k} onClick={() => onChange(o.k)}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", value === o.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
          {o.l}
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={value === "custom" ? "default" : "ghost"} size="sm" className="h-8">
            <CalendarIcon />
            {value === "custom" && custom?.from ? `${fmtDate(custom.from)}${custom.to ? " – " + fmtDate(custom.to) : ""}` : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="range" selected={custom} onSelect={(r) => { onCustom(r); onChange("custom"); }} numberOfMonths={1} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
