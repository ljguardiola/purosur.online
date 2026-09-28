import { TableActionButtons } from "./table-actions";
import { alignClassName, cellHorizontalPaddingClassName } from "./table-styles";
import type { TableColumn } from "./table-types";

export function TableCell<T>({
  column,
  item,
  isFirst,
  isLast,
}: {
  column: TableColumn<T>;
  item: T;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isActions = column.kind === "actions";
  const align = isActions ? "start" : column.align;

  return (
    <td
      className={[
        "h-control-4xl break-words align-middle py-2",
        cellHorizontalPaddingClassName(isFirst, isLast),
        alignClassName(align),
        align === "end" ? "tabular-nums" : "",
      ].join(" ")}
    >
      <div
        className={
          isActions
            ? "flex flex-row items-center justify-end gap-2"
            : ["flex flex-col justify-center", align === "end" ? "items-end" : "items-start"].join(
                " ",
              )
        }
      >
        {isActions ? (
          <TableActionButtons actions={column.actions} item={item} />
        ) : (
          // items-start/-end opts out of flex stretch, so an unbreakable run's unclamped preferred
          // width can exceed the column; max-w-full caps it there so it wraps instead of overflowing.
          <div className="flex flex-col gap-1 max-w-full">{column.render(item)}</div>
        )}
      </div>
    </td>
  );
}
