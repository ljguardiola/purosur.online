import { Button } from "../forms/button";
import { Tooltip } from "../overlays/tooltip";
import type { Icon } from "../shared/icon";
import { InlineNotice } from "./inline-notice";
import { PillButton } from "./pill-button";

export type LoadFailureVariant = "section" | "screen" | "pill";

export type LoadFailureProps = {
  icon: Icon;
  title: string;
  description?: string | undefined;
  variant?: LoadFailureVariant | undefined;
  onRetry: () => void;
};

export function LoadFailure({
  icon,
  title,
  description,
  variant = "section",
  onRetry,
}: LoadFailureProps) {
  if (variant === "pill") {
    const pill = (
      <PillButton tone="error" icon={icon} aria-label={`${title}. Reintentar`} onPress={onRetry}>
        {title}
        <span className="underline">Reintentar</span>
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
