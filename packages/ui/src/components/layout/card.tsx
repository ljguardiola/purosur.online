import type { ReactNode } from "react";

export type CardProps = {
  children: ReactNode;
  variant?: "outlined" | "subtle" | undefined;
};

const variantClassName = {
  outlined: "rounded-lg border border-border bg-surface p-6",
  subtle: "rounded-lg bg-surface-subtle p-4",
} as const;

export function Card({ children, variant = "outlined" }: CardProps) {
  return <div className={`flex flex-col gap-4 ${variantClassName[variant]}`}>{children}</div>;
}
