import { type ReactNode, useId } from "react";

export type WarningBlockProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function WarningBlock({ title, action, children }: WarningBlockProps) {
  const titleId = useId();
  return (
    <fieldset
      aria-labelledby={titleId}
      className="m-0 flex min-w-0 flex-col gap-3 rounded-lg border border-warning-soft bg-warning-subtle p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="text-caption font-bold uppercase text-warning-strong">
          {title}
        </p>
        {action}
      </div>
      {children}
    </fieldset>
  );
}
