import type { Icon } from "@purosur/ui";
import { Button, SidePanel, SidePanelTitle } from "@purosur/ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

type SettingsPanelProps = {
  icon: Icon;
  title: string;
  onClose: () => void;
  closeLabel?: string | undefined;
  footer?: ReactNode;
  children: ReactNode;
};

export function SettingsPanel({
  icon,
  title,
  onClose,
  closeLabel,
  footer,
  children,
}: SettingsPanelProps) {
  return (
    <SidePanel
      label={title}
      width="wide"
      header={
        <SidePanelTitle
          icon={icon}
          title={title}
          onClose={onClose}
          {...(closeLabel === undefined ? {} : { closeLabel })}
        />
      }
      footer={footer}
    >
      {children}
    </SidePanel>
  );
}

export function SaveButton({
  onPress,
  disabled = false,
  submitting = false,
}: {
  onPress: () => void;
  disabled?: boolean;
  submitting?: boolean;
}) {
  return (
    <Button
      variant="primary"
      size="large"
      fullWidth
      icon={<Check />}
      iconPosition="start"
      keycap="Enter"
      disabled={disabled}
      dataStatus={submitting ? "loading" : "loaded"}
      onPress={onPress}
    >
      Guardar
    </Button>
  );
}
