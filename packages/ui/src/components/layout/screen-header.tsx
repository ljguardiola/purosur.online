import type { Ref } from "react";
import { Eyebrow } from "./eyebrow";

export type ScreenHeaderProps = {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  focusableTitle?: boolean | undefined;
};

export function ScreenHeader({
  eyebrow,
  title,
  description,
  titleId,
  titleRef,
  focusableTitle = false,
}: ScreenHeaderProps) {
  const focusable = titleRef !== undefined || focusableTitle;
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow === undefined ? null : <Eyebrow text={eyebrow} />}
      <h1
        id={titleId}
        ref={titleRef}
        tabIndex={focusable ? -1 : undefined}
        className={`text-display text-text-accent outline-none ${focusable ? "focus-visible:focus-ring-tight" : ""}`}
      >
        {title}
      </h1>
      {description === undefined ? null : (
        <p className="text-body text-text-subtle">{description}</p>
      )}
    </div>
  );
}
