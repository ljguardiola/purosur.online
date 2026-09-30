import type { ReactNode, Ref } from "react";
import { Eyebrow } from "../shell/eyebrow";

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
      <div className="flex flex-col gap-1.5">
        {eyebrow === undefined ? null : <Eyebrow text={eyebrow} />}
        <h1 ref={headingRef} tabIndex={-1} className="text-display text-text-accent outline-none">
          {title}
        </h1>
        {description === undefined ? null : (
          <p className="text-body text-text-subtle">{description}</p>
        )}
      </div>
      {children}
    </main>
  );
}
