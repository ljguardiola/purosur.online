import { ChevronRight } from "lucide-react";
import { type AnchorHTMLAttributes, type ReactNode, useId } from "react";
import { type Icon, iconSlotClassName } from "../shared/icon";

export type LinkListCardProps = {
  title: string;
  icon: Icon;
  children: ReactNode;
};

export type LinkListRowProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
};

export function LinkListCard({ title, icon, children }: LinkListCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center gap-3 p-4">
        <span
          aria-hidden="true"
          className={`${iconSlotClassName.lg} box-content rounded-lg bg-action-subtle p-2 text-text-accent`}
        >
          {icon}
        </span>
        <h2 id={headingId} className="text-subheading text-text-accent">
          {title}
        </h2>
      </div>
      <ul className="flex flex-col divide-y divide-border border-border border-t">{children}</ul>
    </section>
  );
}

export function LinkListRow({ label, ...props }: LinkListRowProps) {
  return (
    <li>
      <a
        {...props}
        className="flex items-center justify-between gap-2 px-4 py-3 text-detail text-text outline-none transition-colors hover:bg-surface-subtle focus-visible:focus-ring-tight"
      >
        <span>{label}</span>
        <ChevronRight aria-hidden="true" className="size-icon-sm shrink-0 text-text-subtle" />
      </a>
    </li>
  );
}
