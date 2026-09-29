import {
  alignClassName,
  cellHorizontalPaddingClassName,
  rowBoxShadowClassName,
} from "./table-styles";
import type { TableColumn } from "./table-types";

const PLACEHOLDER_ROW_IDS = [
  "placeholder-1",
  "placeholder-2",
  "placeholder-3",
  "placeholder-4",
  "placeholder-5",
];
// Cycled per column so every placeholder bar gets a varied width without shifting on re-render.
const PLACEHOLDER_WIDTHS_PERCENT = [72, 48, 64, 56, 80, 40];

function PlaceholderRow<T>({
  columns,
  lastRow,
}: {
  columns: readonly TableColumn<T>[];
  lastRow: boolean;
}) {
  return (
    <tr
      className={[
        "h-control-4xl",
        rowBoxShadowClassName(undefined, lastRow),
        "animate-table-placeholder-reveal",
      ].join(" ")}
    >
      {columns.map((column, index) => {
        const actionsColumn = column.kind === "actions";
        const align = actionsColumn ? "start" : column.align;
        const widthPercent = PLACEHOLDER_WIDTHS_PERCENT[index % PLACEHOLDER_WIDTHS_PERCENT.length];
        const first = index === 0;
        const last = index === columns.length - 1;

        return (
          <td
            key={column.key}
            className={[
              "align-middle",
              cellHorizontalPaddingClassName(first, last),
              alignClassName(align),
            ].join(" ")}
          >
            {actionsColumn ? (
              <div className="flex flex-row items-center justify-end gap-2">
                <div className="size-control-md shrink-0 rounded-lg bg-surface-soft" />
                {column.actions.length === 2 && (
                  <div className="size-control-md shrink-0 rounded-lg bg-surface-soft" />
                )}
              </div>
            ) : (
              <div
                className={["flex", align === "end" ? "justify-end" : "justify-start"].join(" ")}
              >
                <div
                  className="h-3 rounded-md bg-surface-soft"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export function TablePlaceholderRows<T>({ columns }: { columns: readonly TableColumn<T>[] }) {
  return PLACEHOLDER_ROW_IDS.map((id, index) => (
    <PlaceholderRow key={id} columns={columns} lastRow={index === PLACEHOLDER_ROW_IDS.length - 1} />
  ));
}
