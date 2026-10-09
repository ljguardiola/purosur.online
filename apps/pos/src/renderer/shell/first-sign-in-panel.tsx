import { ScreenHeader } from "@purosur/ui";
import type { ReactNode, Ref } from "react";

export function FirstSignInPanel({
  eyebrow,
  title,
  description,
  headingRef,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <main className="flex w-full max-w-110 flex-col gap-4">
      <ScreenHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        titleRef={headingRef}
      />
      {children}
    </main>
  );
}
