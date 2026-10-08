import { ScreenTitle } from "../shell/screen-title";

export function SalesTopBar({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
      <div className="flex flex-col justify-center">
        <p className="text-text-subtle text-detail">{eyebrow}</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
    </div>
  );
}
