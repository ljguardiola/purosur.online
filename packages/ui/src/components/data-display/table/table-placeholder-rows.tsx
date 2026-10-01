import type { Column, RowData } from "@tanstack/react-table";
import {
  PlaceholderLine,
  PlaceholderSquare,
  placeholderLineWidthPercent,
} from "../../feedback/placeholder-shapes";
import { columnActionCount, columnAlign } from "./table-column";
import type { tableModelFeatures } from "./table-features";
import {
  alignClassName,
  cellHorizontalPaddingClassName,
  rowBoxShadowClassName,
} from "./table-styles";

type TableColumnOf<T extends RowData> = Column<typeof tableModelFeatures, T, unknown>;

const PLACEHOLDER_ROW_IDS = [
  "placeholder-1",
  "placeholder-2",
  "placeholder-3",
  "placeholder-4",
  "placeholder-5",
];

function PlaceholderRow<T extends RowData>({
  columns,
  lastRow,
}: {
  columns: readonly TableColumnOf<T>[];
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
        const actionCount = columnActionCount(column);
        const align = actionCount === undefined ? columnAlign(column) : "start";
        const first = index === 0;
        const last = index === columns.length - 1;

        return (
          <td
            key={column.id}
            className={[
              "align-middle",
              cellHorizontalPaddingClassName(first, last),
              alignClassName(align),
            ].join(" ")}
          >
            {actionCount !== undefined ? (
              <div className="flex flex-row items-center justify-end gap-2">
                <PlaceholderSquare />
                {actionCount === 2 && <PlaceholderSquare />}
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

export function TablePlaceholderRows<T extends RowData>({
  columns,
}: {
  columns: readonly TableColumnOf<T>[];
}) {
  return PLACEHOLDER_ROW_IDS.map((id, index) => (
    <PlaceholderRow key={id} columns={columns} lastRow={index === PLACEHOLDER_ROW_IDS.length - 1} />
  ));
}
