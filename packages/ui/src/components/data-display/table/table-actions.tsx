import { IconButton } from "../../forms/icon-button";
import type { TableAction, TableColumn } from "./table-types";

// 60px for one 38px IconButton, 104px for two with an 8px gap between them.
const ACTIONS_CONTENT_WIDTH_PX: Record<1 | 2, number> = {
  1: 60,
  2: 104,
};

const CELL_EDGE_PADDING_PX = 16;
const CELL_INNER_PADDING_PX = 6;

// table-fixed reads a column's width only from its header cell, whose padding shares the same
// border-box as the declared width, so it has to be added on top of the content width here.
export function headerColumnWidthStyle<T>(
  column: TableColumn<T>,
  isFirst: boolean,
  isLast: boolean,
): { width: string } | undefined {
  if (column.kind !== "actions") {
    return undefined;
  }
  const leftPadding = isFirst ? CELL_EDGE_PADDING_PX : CELL_INNER_PADDING_PX;
  const rightPadding = isLast ? CELL_EDGE_PADDING_PX : CELL_INNER_PADDING_PX;
  return {
    width: `${ACTIONS_CONTENT_WIDTH_PX[column.actions.length] + leftPadding + rightPadding}px`,
  };
}

// No key: never in a `.map()`, so React tracks it by JSX position, updating this same button in
// place when its label changes instead of remounting a new one.
function TableActionButton<T>({ action, item }: { action: TableAction<T>; item: T }) {
  const descriptor = action(item);
  if (!descriptor) {
    // Matches the visible action button's own footprint, so the other action doesn't shift.
    return <span aria-hidden="true" className="size-control-md shrink-0" />;
  }
  const { icon, "aria-label": ariaLabel, onPress } = descriptor;
  return <IconButton icon={icon} aria-label={ariaLabel} onPress={onPress} />;
}

export function TableActionButtons<T>({
  actions,
  item,
}: {
  actions: readonly [TableAction<T>] | readonly [TableAction<T>, TableAction<T>];
  item: T;
}) {
  return (
    <>
      <TableActionButton action={actions[0]} item={item} />
      {actions[1] ? <TableActionButton action={actions[1]} item={item} /> : null}
    </>
  );
}
