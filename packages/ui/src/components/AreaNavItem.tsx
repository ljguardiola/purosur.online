import type { AnchorHTMLAttributes, ReactElement } from "react";

export type AreaNavItemIcon = ReactElement<{ className?: string }>;

export type AreaNavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
  icon: AreaNavItemIcon;
  active: boolean;
};

const baseClassName =
  "flex w-15 flex-col items-center justify-center gap-1 rounded-lg px-0 py-2 outline-none " +
  "focus-visible:focus-ring-inverse";

const backgroundClassName: Record<"active" | "inactive", string> = {
  inactive: "",
  active: "bg-surface-nav-subtle",
};

const iconWrapperClassName = "inline-flex size-icon-lg shrink-0 *:size-full";

const iconToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-text-inverse-subtle",
  active: "text-text-inverse",
};

const labelToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-caption text-text-inverse-subtle",
  active: "text-caption font-bold text-text-inverse",
};

export function AreaNavItem({ label, icon, active, ...props }: AreaNavItemProps) {
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
