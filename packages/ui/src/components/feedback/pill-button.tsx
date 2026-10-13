import { Button as AriaButton } from "react-aria-components";
import {
  PillContent,
  type PillContentProps,
  pillClassName,
  pillPressableHoverRingClassName,
} from "./pill-look";

export type PillButtonProps = PillContentProps & {
  onPress: () => void;
  "aria-label"?: string;
};

export function PillButton({ tone, icon, children, onPress, ...name }: PillButtonProps) {
  return (
    <AriaButton
      {...name}
      onPress={onPress}
      className={`${pillClassName(tone)} ${pillPressableHoverRingClassName[tone]} outline-none data-focus-visible:focus-ring-tight`}
    >
      <PillContent icon={icon}>{children}</PillContent>
    </AriaButton>
  );
}
