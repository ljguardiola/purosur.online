import { MenuTrigger as AriaMenuTrigger } from "react-aria-components";
import { RowActionsPopover, type RowMenuActions } from "../data-display/table/row-actions-menu";
import type { Icon } from "../shared/icon";
import { Button } from "./button";

export type MenuButtonProps = {
  label: string;
  actions: RowMenuActions;
  icon?: Icon;
};

export function MenuButton({ label, actions, icon }: MenuButtonProps) {
  return (
    <AriaMenuTrigger>
      <Button variant="primary" {...(icon === undefined ? {} : { icon })}>
        {label}
      </Button>
      <RowActionsPopover actions={actions} />
    </AriaMenuTrigger>
  );
}
