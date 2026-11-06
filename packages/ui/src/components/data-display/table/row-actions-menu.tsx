import { Ellipsis } from "lucide-react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import {
  menuOptionFrameClassName,
  menuPopoverStyle,
  menuSurfaceClassName,
} from "../../forms/field-styles";
import { borderedIconButtonClassName } from "../../forms/icon-button";
import { type Icon, iconSlotClassName } from "../../shared/icon";
import { IconOnlyButton } from "../../shared/icon-only-button";

export type RowMenuAction = {
  label: string;
  icon?: Icon;
  onAction: () => void;
  disabledReason?: string;
  destructive?: boolean;
};

export type RowMenuActions = readonly [RowMenuAction, ...RowMenuAction[]];

const popoverClassName = `min-w-56 p-1.5 overflow-y-auto ${menuSurfaceClassName}`;

// A disabled item takes neither focus nor hover in a menu, so a tooltip could not be reached: its
// reason is shown as text below the label instead, and read once as the end of the item's name.
const itemClassName = `group min-h-control-lg gap-2 py-1.5 data-disabled:cursor-default ${menuOptionFrameClassName}`;

function RowMenuItem({ action }: { action: RowMenuAction }) {
  const { label, icon, onAction, disabledReason, destructive = false } = action;
  const toneClassName = destructive ? "text-error" : "";
  return (
    <AriaMenuItem
      textValue={label}
      isDisabled={disabledReason !== undefined}
      onAction={onAction}
      className={itemClassName}
    >
      {icon !== undefined ? (
        <span
          aria-hidden="true"
          className={`${iconSlotClassName.sm} ${toneClassName} group-data-disabled:opacity-disabled`}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 grow flex-col">
        <span className={`${toneClassName} group-data-disabled:opacity-disabled`}>{label}</span>
        {disabledReason !== undefined ? (
          <span className="text-detail font-normal text-text-subtle">{disabledReason}</span>
        ) : null}
      </span>
    </AriaMenuItem>
  );
}

export function RowActionsMenu({ actions }: { actions: RowMenuActions }) {
  return (
    <AriaMenuTrigger>
      <IconOnlyButton name="Más acciones" className={borderedIconButtonClassName}>
        <span aria-hidden="true" className={iconSlotClassName.md}>
          <Ellipsis />
        </span>
      </IconOnlyButton>
      <AriaPopover
        placement="bottom end"
        offset={4}
        style={menuPopoverStyle}
        className={popoverClassName}
      >
        <AriaMenu className="flex flex-col gap-1 outline-none">
          {actions.map((action) => (
            <RowMenuItem key={action.label} action={action} />
          ))}
        </AriaMenu>
      </AriaPopover>
    </AriaMenuTrigger>
  );
}
