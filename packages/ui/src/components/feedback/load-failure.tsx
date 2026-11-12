import { RefreshCw } from "lucide-react";
import type { KeyName } from "../data-display/keycap";
import { Button } from "../forms/button";
import { Tooltip } from "../overlays/tooltip";
import { type Icon, iconSlotClassName } from "../shared/icon";
import { InlineNotice } from "./inline-notice";
import { NoticeLiveRegion } from "./notice-live-region";
import { PillButton } from "./pill-button";

export type LoadFailureVariant = "section" | "screen" | "pill";

export type LoadFailureProps = {
  icon: Icon;
  title: string;
  description?: string | undefined;
  variant?: LoadFailureVariant | undefined;
  onRetry: () => void;
};

export type CenteredLoadFailureProps = Omit<LoadFailureProps, "variant" | "onRetry"> & {
  variant: "centered";
};

type KeyboardLoadFailureProps = Omit<LoadFailureProps, "variant"> & {
  variant: "keyboard";
  keycap: KeyName;
};

export function LoadFailure(
  props: LoadFailureProps | CenteredLoadFailureProps | KeyboardLoadFailureProps,
) {
  const { icon, title, description } = props;

  if (props.variant === "centered") {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
        <span
          aria-hidden="true"
          className="flex size-22 shrink-0 items-center justify-center rounded-full bg-error-subtle text-error"
        >
          <span className={iconSlotClassName["4xl"]}>{icon}</span>
        </span>
        <NoticeLiveRegion
          assertiveness="assertive"
          text={[title, description].filter(Boolean).join(" ")}
        />
        <p aria-hidden="true" className="max-w-130 text-title text-text-accent">
          {title}
        </p>
        {description ? (
          <p aria-hidden="true" className="max-w-130 text-body text-text-subtle">
            {description}
          </p>
        ) : null}
      </div>
    );
  }

  const { variant = "section", onRetry } = props;
  if (variant === "pill") {
    const pill = (
      <PillButton tone="error" icon={icon} aria-label={`${title}. Reintentar`} onPress={onRetry}>
        {title} <span className="underline">Reintentar</span>
      </PillButton>
    );
    return description === undefined ? pill : <Tooltip description={description}>{pill}</Tooltip>;
  }

  const notice = (
    <InlineNotice
      tone="error"
      icon={icon}
      title={title}
      {...(description === undefined ? {} : { description })}
    />
  );

  if (props.variant === "keyboard") {
    return (
      <div className="flex flex-col gap-4">
        {notice}
        <Button
          fullWidth
          icon={<RefreshCw />}
          iconPosition="start"
          keycap={props.keycap}
          onPress={onRetry}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (variant === "screen") {
    return (
      <div className="flex flex-col gap-4">
        {notice}
        <Button size="large" onPress={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      {notice}
      <Button variant="secondary" onPress={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
