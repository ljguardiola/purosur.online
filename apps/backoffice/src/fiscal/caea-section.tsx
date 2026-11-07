import { type ReactNode, useId } from "react";

export function CaeaSection({
  anchor,
  title,
  children,
}: {
  anchor: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section id={anchor} aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}
