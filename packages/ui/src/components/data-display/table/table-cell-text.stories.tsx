import type { Meta, StoryObj } from "@storybook/react-vite";
import { TableCellText } from "./table-cell-text";

const meta: Meta<typeof TableCellText> = {
  title: "Components/TableCellText",
  component: TableCellText,
};

export default meta;

type Story = StoryObj<typeof TableCellText>;

export const TextOnly: Story = {
  args: { children: "Café en grano" },
};

export const WithDetail: Story = {
  args: { children: "Café en grano", detail: "SKU-001" },
};

export const LongContent: Story = {
  args: {
    children: "Un nombre de producto muy largo que no entra en una sola línea de esta columna",
    detail:
      "Un detalle igualmente largo que también debería ajustarse a varias líneas si hace falta",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "220px" }}>
        <Story />
      </div>
    ),
  ],
};
