import { IconButton } from "../../forms/icon-button";
import { RowActionsMenu } from "./row-actions-menu";
import type {
  TableAction,
  TableActions,
  TableActionsBesideMenu,
  TableRowMenu,
  TableVariant,
} from "./table-types";

// 60px for one 38px IconButton, then 44px more for each further one (38px plus an 8px gap).
const ACTIONS_CONTENT_WIDTH_PX: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 60,
  2: 104,
  3: 148,
  4: 192,
  5: 236,
  6: 280,
};

const CELL_EDGE_PADDING_PX = 16;
const CELL_INNER_PADDING_PX = 6;

// table-fixed reads a column's width from its <col>, ahead of any group header row, and the cell's
// padding shares that width, so it has to be added on top of the content width here.
export function headerColumnWidthStyle(
  contentWidth: number | undefined,
  first: boolean,
  last: boolean,
  variant: TableVariant,
): { width: string } | undefined {
  if (contentWidth === undefined) {
    return undefined;
  }
  const edgePadding = variant === "nested" ? 0 : CELL_EDGE_PADDING_PX;
  const leftPadding = first ? edgePadding : CELL_INNER_PADDING_PX;
  const rightPadding = last ? edgePadding : CELL_INNER_PADDING_PX;
  return { width: `${contentWidth + leftPadding + rightPadding}px` };
}

export function actionsContentWidth(actionCount: 1 | 2 | 3 | 4 | 5 | 6): number {
  return ACTIONS_CONTENT_WIDTH_PX[actionCount];
}

// No key: never in a `.map()`, so React tracks it by JSX position, updating this same button in
// place when its label changes instead of remounting a new one.
function TableActionButton<T>({ action, item }: { action: TableAction<T>; item: T }) {
  const descriptor = action(item);
  if (!descriptor) {
    // Matches the visible action button's own footprint, so the other action doesn't shift.
    return <span aria-hidden="true" className="size-control-md shrink-0" />;
  }
  const { icon, "aria-label": ariaLabel, disabled = false, onPress } = descriptor;
  return <IconButton icon={icon} aria-label={ariaLabel} disabled={disabled} onPress={onPress} />;
}

function TableRowMenuButton<T>({ menu, item }: { menu: TableRowMenu<T>; item: T }) {
  const menuActions = menu(item);
  if (!menuActions) {
    return <span aria-hidden="true" className="size-control-md shrink-0" />;
  }
  return <RowActionsMenu actions={menuActions} />;
}

export function TableActionButtons<T>({
  actions,
  menu,
  item,
}: {
  actions: TableActions<T> | TableActionsBesideMenu<T>;
  menu?: TableRowMenu<T> | undefined;
  item: T;
}) {
  return (
    <>
      {actions[0] ? <TableActionButton action={actions[0]} item={item} /> : null}
      {actions[1] ? <TableActionButton action={actions[1]} item={item} /> : null}
      {actions[2] ? <TableActionButton action={actions[2]} item={item} /> : null}
      {actions[3] ? <TableActionButton action={actions[3]} item={item} /> : null}
      {actions[4] ? <TableActionButton action={actions[4]} item={item} /> : null}
      {actions[5] ? <TableActionButton action={actions[5]} item={item} /> : null}
      {menu ? <TableRowMenuButton menu={menu} item={item} /> : null}
    </>
  );
}
