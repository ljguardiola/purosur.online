import type { AnchorHTMLAttributes, ReactElement } from "react";

export type SectionNavItemIcon = ReactElement<{ className?: string }>;

export type SectionNavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
  icon: SectionNavItemIcon;
  active: boolean;
};

const baseClassName =
  "flex h-10 w-full items-center gap-2 rounded-lg px-2 outline-none transition-colors " +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus";

const backgroundClassName: Record<"active" | "inactive", string> = {
  inactive: "hover:bg-surface-subtle",
  active: "bg-action-subtle",
};

const iconWrapperClassName = "inline-flex size-[1.125rem] shrink-0 [&>svg]:h-full [&>svg]:w-full";

const iconToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-text-subtle",
  active: "text-text-accent",
};

const labelToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-sm font-normal text-text",
  active: "text-base font-bold text-text-accent",
};

export function SectionNavItem({ label, icon, active, ...props }: SectionNavItemProps) {
  const tone = active ? "active" : "inactive";
  return (
    <a
      {...props}
      aria-current={active ? "page" : undefined}
      className={`${baseClassName} ${backgroundClassName[tone]}`}
    >
      <span aria-hidden="true" className={`${iconWrapperClassName} ${iconToneClassName[tone]}`}>
        {icon}
      </span>
      <span className={labelToneClassName[tone]}>{label}</span>
    </a>
  );
}
