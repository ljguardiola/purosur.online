import type { ReactNode } from "react";

export type RegisterFrameProps = {
  background: "surface" | "subtle";
  rail: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

const BACKGROUNDS = { surface: "bg-surface", subtle: "bg-surface-subtle" } as const;

export function RegisterFrame({ background, rail, aside, children }: RegisterFrameProps) {
  return (
    <div className={`flex h-full w-full ${BACKGROUNDS[background]}`}>
      {rail}
      {children}
      {aside}
    </div>
  );
}
