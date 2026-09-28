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
  isLastRow,
}: {
  columns: readonly TableColumn<T>[];
  isLastRow: boolean;
}) {
  return (
    <tr
      className={[
        "h-control-4xl",
        rowBoxShadowClassName(undefined, isLastRow),
        "animate-table-placeholder-reveal",
      ].join(" ")}
    >
      {columns.map((column, index) => {
        const isActions = column.kind === "actions";
        const align = isActions ? "start" : column.align;
        const widthPercent = PLACEHOLDER_WIDTHS_PERCENT[index % PLACEHOLDER_WIDTHS_PERCENT.length];
        const isFirst = index === 0;
        const isLast = index === columns.length - 1;

        return (
          <td
            key={column.key}
            className={[
              "align-middle",
              cellHorizontalPaddingClassName(isFirst, isLast),
              alignClassName(align),
            ].join(" ")}
          >
            {isActions ? (
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
    <PlaceholderRow
      key={id}
      columns={columns}
      isLastRow={index === PLACEHOLDER_ROW_IDS.length - 1}
    />
  ));
}
