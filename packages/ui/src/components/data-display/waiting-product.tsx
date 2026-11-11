import { ListPlus } from "lucide-react";
import { Button } from "../forms/button";
import { Eyebrow } from "../layout/eyebrow";

export type WaitingProductProps = {
  label: string;
  name: string;
  detail?: string | undefined;
  more?: string | undefined;
  discardLabel: string;
  onDiscard: () => void;
};

export function WaitingProduct({
  label,
  name,
  detail,
  more,
  discardLabel,
  onDiscard,
}: WaitingProductProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info-strong *:size-icon-md"
      >
        <ListPlus />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <Eyebrow text={label} tone="info" />
        <p className="text-body break-words">
          <span className="font-bold text-text">{name}</span>
          {detail === undefined ? null : <span className="text-text-subtle">{` · ${detail}`}</span>}
          {more === undefined ? null : <span className="text-text-subtle">{` ${more}`}</span>}
        </p>
      </div>
      <Button variant="secondary" keycap="Delete" onPress={onDiscard}>
        {discardLabel}
      </Button>
    </div>
  );
}
