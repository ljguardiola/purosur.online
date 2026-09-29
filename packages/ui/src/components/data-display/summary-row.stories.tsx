import type { Meta, StoryObj } from "@storybook/react-vite";
import { SummaryRow } from "./summary-row";

const meta: Meta<typeof SummaryRow> = {
  title: "Components/SummaryRow",
  component: SummaryRow,
};

export default meta;

type Story = StoryObj<typeof SummaryRow>;

export const Regular: Story = {
  args: { label: "Subtotal", value: "$120.000" },
};

export const Strong: Story = {
  args: { label: "Total", value: "$150.000", strong: true },
};

export const Saving: Story = {
  args: { label: "Descuento", value: "-$10.000", saving: true },
};

export const StrongSaving: Story = {
  args: { label: "Total de ahorro", value: "-$25.000", strong: true, saving: true },
};

export const LongLabel: Story = {
  args: {
    label: "Un motivo largo que no entra en una sola línea dentro de esta fila angosta",
    value: "$1.000",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "200px" }}>
        <Story />
      </div>
    ),
  ],
};

export const LongValue: Story = {
  args: {
    label: "Pago",
    value: "Un valor largo que no entra en una sola línea dentro de esta fila angosta",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "200px" }}>
        <Story />
      </div>
    ),
  ],
};
