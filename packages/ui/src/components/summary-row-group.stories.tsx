import type { Meta, StoryObj } from "@storybook/react-vite";
import { SummaryRowGroup } from "./SummaryRowGroup";

const meta: Meta<typeof SummaryRowGroup> = {
  title: "Components/SummaryRowGroup",
  component: SummaryRowGroup,
};

export default meta;

type Story = StoryObj<typeof SummaryRowGroup>;

export const Default: Story = {
  args: {
    rows: [
      { label: "Artículos", value: "3" },
      { label: "Subtotal", value: "$120.000" },
      { label: "Total", value: "$120.000", strong: true },
    ],
  },
};

export const WithSaving: Story = {
  args: {
    rows: [
      { label: "Subtotal", value: "$130.000" },
      { label: "Descuento", value: "-$10.000", saving: true },
      { label: "Total", value: "$120.000", strong: true },
    ],
  },
};

export const SingleRow: Story = {
  args: {
    rows: [{ label: "Total", value: "$120.000", strong: true }],
  },
};
