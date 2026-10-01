import type { Cell, RowData } from "@tanstack/react-table";
import { columnActionCount, columnAlign, renderCell } from "./table-column";
import type { tableModelFeatures } from "./table-features";
import { alignClassName, cellHorizontalPaddingClassName } from "./table-styles";

export function TableCell<T extends RowData>({
  cell,
  first,
  last,
}: {
  cell: Cell<typeof tableModelFeatures, T, unknown>;
  first: boolean;
  last: boolean;
}) {
  const actionsColumn = columnActionCount(cell.column) !== undefined;
  const align = actionsColumn ? "start" : columnAlign(cell.column);

  return (
    <td
      className={[
        "h-control-4xl break-words align-middle py-2",
        cellHorizontalPaddingClassName(first, last),
        alignClassName(align),
        align === "end" ? "tabular-nums" : "",
      ].join(" ")}
    >
      <div
        className={
          actionsColumn
            ? "flex flex-row items-center justify-end gap-2"
            : ["flex flex-col justify-center", align === "end" ? "items-end" : "items-start"].join(
                " ",
              )
        }
      >
        {actionsColumn ? (
          renderCell(cell)
        ) : (
          // items-start/-end opts out of flex stretch, so an unbreakable run's unclamped preferred
          // width can exceed the column; max-w-full caps it there so it wraps instead of overflowing.
          <div className="flex flex-col gap-1 max-w-full">{renderCell(cell)}</div>
        )}
      </div>
    </td>
  );
}
