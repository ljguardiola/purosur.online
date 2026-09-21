import type { AnchorHTMLAttributes, ReactElement } from "react";

export type AreaNavItemIcon = ReactElement<{ className?: string }>;

export type AreaNavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  label: string;
  icon: AreaNavItemIcon;
  active: boolean;
};

const baseClassName =
  "flex w-15 flex-col items-center justify-center gap-1 rounded-lg px-0 py-2 outline-none " +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-surface-white";

const backgroundClassName: Record<"active" | "inactive", string> = {
  inactive: "",
  active: "bg-surface-white-veil",
};

const iconWrapperClassName = "inline-flex size-5 shrink-0 [&>svg]:h-full [&>svg]:w-full";

const iconToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-blue-soft",
  active: "text-surface-white",
};

const labelToneClassName: Record<"active" | "inactive", string> = {
  inactive: "text-xs font-normal text-blue-soft",
  active: "text-xs font-bold text-surface-white",
};

/** One item in the backoffice's area rail: the register-style icon-over-label nav button. */
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
