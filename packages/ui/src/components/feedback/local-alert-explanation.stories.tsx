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

export const SalesDeniedDamagedDatabase: Story = {
  args: { kind: "sales_denied", reason: "local_database_damaged" },
};

export const RegisterSilent: Story = {
  args: { kind: "register_silent" },
};

export const InstallationRevoked: Story = {
  args: { kind: "installation_revoked" },
};

export const LatePaymentRefund: Story = {
  args: { kind: "late_payment_refund", providerOrderId: null },
};

export const RefundTask: Story = {
  args: { kind: "refund_task" },
};

export const FiscalEmissionStopped: Story = {
  args: { kind: "fiscal_emission_stopped" },
};

export const LatePaymentRefundOfSecondOrder: Story = {
  args: { kind: "late_payment_refund", providerOrderId: "ORD01JZ8K3M4N5P6Q7R8S9T0V" },
};
