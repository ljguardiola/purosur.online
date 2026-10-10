import type { Meta, StoryObj } from "@storybook/react-vite";
import { LocalAlertExplanation } from "./local-alert-explanation";

const meta: Meta<typeof LocalAlertExplanation> = {
  title: "Components/LocalAlertExplanation",
  component: LocalAlertExplanation,
  decorators: [
    (Story) => (
      <div className="flex max-w-xl flex-col gap-3">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LocalAlertExplanation>;

export const SalesDenied: Story = {
  args: { kind: "sales_denied", reason: "event_history_broken" },
};

export const SalesDeniedWithTitle: Story = {
  args: { kind: "sales_denied", reason: "event_history_broken", title: true },
};

export const SalesDeniedDamagedDatabase: Story = {
  args: { kind: "sales_denied", reason: "local_database_damaged" },
};

export const SalesDeniedDamagedDatabaseWithTitle: Story = {
  args: { kind: "sales_denied", reason: "local_database_damaged", title: true },
};

export const RegisterSilent: Story = {
  args: { kind: "register_silent" },
};

export const RegisterSilentWithTitle: Story = {
  args: { kind: "register_silent", title: true },
};

export const InstallationRevoked: Story = {
  args: { kind: "installation_revoked" },
};

export const InstallationRevokedWithTitle: Story = {
  args: { kind: "installation_revoked", title: true },
};
