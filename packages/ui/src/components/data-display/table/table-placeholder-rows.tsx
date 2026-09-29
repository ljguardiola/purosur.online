import {
  PlaceholderLine,
  PlaceholderSquare,
  placeholderLineWidthPercent,
} from "../../feedback/placeholder-shapes";
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
        "animate-placeholder-reveal",
      ].join(" ")}
    >
      {columns.map((column, index) => {
        const actionsColumn = column.kind === "actions";
        const align = actionsColumn ? "start" : column.align;
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
                <PlaceholderSquare />
                {column.actions.length === 2 && <PlaceholderSquare />}
              </div>
            ) : (
              <div
                className={["flex", align === "end" ? "justify-end" : "justify-start"].join(" ")}
              >
                <PlaceholderLine widthPercent={placeholderLineWidthPercent(index)} />
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
