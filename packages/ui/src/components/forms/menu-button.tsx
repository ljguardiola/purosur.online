import { MenuTrigger as AriaMenuTrigger } from "react-aria-components";
import { RowActionsPopover, type RowMenuActions } from "../data-display/table/row-actions-menu";
import { Button } from "./button";

export type MenuButtonProps = {
  label: string;
  actions: RowMenuActions;
};

export function MenuButton({ label, actions }: MenuButtonProps) {
  return (
    <AriaMenuTrigger>
      <Button variant="primary">{label}</Button>
      <RowActionsPopover actions={actions} />
    </AriaMenuTrigger>
  );
}
