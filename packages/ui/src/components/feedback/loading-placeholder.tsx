import { NoticeLiveRegion } from "./notice-live-region";
import {
  PlaceholderField,
  PlaceholderLine,
  PlaceholderSquare,
  placeholderIds,
  placeholderLineWidthPercent,
} from "./placeholder-shapes";

export type LoadingPlaceholderProps =
  | { variant: "form"; fields: number }
  | { variant: "card"; lines: number }
  | { variant: "list"; items: number }
  | { variant: "rows"; rows: number }
  | { variant: "pill" };

function FormShapes({ fields }: { fields: number }) {
  return (
    <div aria-hidden="true" className="flex animate-placeholder-reveal flex-col gap-4">
      {placeholderIds("field", fields).map((id) => (
        <div key={id} className="flex flex-col gap-1">
          <div className="flex h-5 items-center">
            <PlaceholderLine widthPercent={30} />
          </div>
          <PlaceholderField />
        </div>
      ))}
    </div>
  );
}

function CardShapes({ lines }: { lines: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex animate-placeholder-reveal flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <PlaceholderLine widthPercent={40} />
      {placeholderIds("line", lines).map((id, position) => (
        <PlaceholderLine key={id} widthPercent={placeholderLineWidthPercent(position)} />
      ))}
    </div>
  );
}

function ListShapes({ items }: { items: number }) {
  return (
    <div aria-hidden="true" className="flex animate-placeholder-reveal flex-col gap-2">
      {placeholderIds("item", items).map((id, position) => (
        <div key={id} className="flex items-center gap-3">
          <div className="size-icon-lg shrink-0 rounded-md bg-surface-soft" />
          <div className="flex flex-1 flex-col gap-1">
            <PlaceholderLine widthPercent={placeholderLineWidthPercent(position)} />
            <PlaceholderLine widthPercent={placeholderLineWidthPercent(position + 1) / 2} />
          </div>
          <PlaceholderSquare />
        </div>
      ))}
    </div>
  );
}

function RowShapes({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="flex animate-placeholder-reveal flex-col gap-1">
      {placeholderIds("row", rows).map((id, position) => (
        <div key={id} className="flex h-6 items-center justify-between gap-4">
          <PlaceholderLine widthPercent={placeholderLineWidthPercent(position) / 2} />
          <PlaceholderLine widthPercent={25} />
        </div>
      ))}
    </div>
  );
}

function PillShape() {
  return (
    <div
      aria-hidden="true"
      className="h-7 w-36 animate-placeholder-reveal rounded-full bg-surface-soft"
    />
  );
}

export function LoadingPlaceholder(props: LoadingPlaceholderProps) {
  return (
    <div>
      <NoticeLiveRegion assertiveness="polite" text="Cargando…" />
      {props.variant === "form" && <FormShapes fields={props.fields} />}
      {props.variant === "card" && <CardShapes lines={props.lines} />}
      {props.variant === "list" && <ListShapes items={props.items} />}
      {props.variant === "rows" && <RowShapes rows={props.rows} />}
      {props.variant === "pill" && <PillShape />}
    </div>
  );
}
