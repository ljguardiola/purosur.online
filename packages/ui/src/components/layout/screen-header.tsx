import type { Ref } from "react";
import { Eyebrow } from "./eyebrow";

export type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
};

export function ScreenHeader({
  eyebrow,
  title,
  description,
  titleId,
  titleRef,
}: ScreenHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow === undefined ? null : <Eyebrow text={eyebrow} />}
      <h1
        id={titleId}
        ref={titleRef}
        tabIndex={titleRef === undefined ? undefined : -1}
        className="text-display text-text-accent outline-none"
      >
        {title}
      </h1>
      {description === undefined ? null : (
        <p className="text-body text-text-subtle">{description}</p>
      )}
    </div>
  );
}
