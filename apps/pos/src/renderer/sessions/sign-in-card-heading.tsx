import type { Icon } from "@purosur/ui";
import { Keycap } from "@purosur/ui";
import type { Ref } from "react";

export function SignInCardHeading({
  icon,
  title,
  titleRef,
  escapeKey = false,
}: {
  icon: Icon;
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
  escapeKey?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-subtle text-text-accent"
      >
        <span className="inline-flex size-icon-md shrink-0 *:size-full">{icon}</span>
      </span>
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="min-w-0 flex-1 text-title text-text outline-none focus-visible:focus-ring-tight"
      >
        {title}
      </h1>
      {escapeKey ? <Keycap keyName="Escape" /> : null}
    </div>
  );
}
