import { Button } from "../forms/button";
import type { Icon } from "../shared/icon";
import { iconSlotClassName } from "../shared/icon";
import { CountdownBar, type CountdownBarProps } from "./countdown-bar";

export type TimedOfferCardProps = {
  icon: Icon;
  title: string;
  skip: { label: string; onPress: () => void };
  countdown: CountdownBarProps;
  accept: { label: string; icon: Icon; onPress: () => void; disabled?: boolean };
};

export function TimedOfferCard({ icon, title, skip, countdown, accept }: TimedOfferCardProps) {
  return (
    <fieldset
      aria-label={title}
      className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text"
        >
          <span className={iconSlotClassName.lg}>{icon}</span>
        </span>
        <p className="flex-1 text-subheading font-bold text-text">{title}</p>
        <Button
          variant="text"
          keycap="Escape"
          disabled={accept.disabled ?? false}
          onPress={skip.onPress}
        >
          {skip.label}
        </Button>
      </div>
      <CountdownBar {...countdown} />
      <Button
        size="large"
        fullWidth
        icon={accept.icon}
        iconPosition="start"
        keycap="Enter"
        disabled={accept.disabled ?? false}
        onPress={accept.onPress}
      >
        {accept.label}
      </Button>
    </fieldset>
  );
}
