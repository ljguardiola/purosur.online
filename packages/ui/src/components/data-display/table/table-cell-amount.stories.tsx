import type { Meta, StoryObj } from "@storybook/react-vite";
import { TableCellAmount } from "./table-cell-amount";

const meta: Meta<typeof TableCellAmount> = {
  title: "Components/TableCellAmount",
  component: TableCellAmount,
};

export default meta;

type Story = StoryObj<typeof TableCellAmount>;

export const Amount: Story = {
  args: { amount: "$ 11.760,00" },
};

export const PerUnit: Story = {
  args: { amount: "$ 1.200,00", unit: "/ kg" },
};

export const PerUnitWhenNarrow: Story = {
  args: { amount: "$ 1.200,00", unit: "/ kg" },
  decorators: [
    (Story) => (
      <div style={{ width: "100px", textAlign: "right" }}>
        <Story />
      </div>
    ),
  ],
};
