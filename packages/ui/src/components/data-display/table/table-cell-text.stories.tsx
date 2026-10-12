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
  args: { children: "Café en grano", description: "SKU-001" },
};

export const LongContent: Story = {
  args: {
    children: "Un nombre de producto muy largo que no entra en una sola línea de esta columna",
    description:
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

export const StrongText: Story = {
  args: { children: "12 u", strong: true },
};

export const SubtleText: Story = {
  args: { children: "$ 5.440,00", tone: "subtle" },
};

export const ErrorText: Story = {
  args: { children: "− 3 u", tone: "error", strong: true },
};

export const SuccessText: Story = {
  args: { children: "+ 3 u", tone: "success", strong: true },
};

export const ErrorDescription: Story = {
  args: {
    children: "Yerba mate orgánica 500 g",
    description: "Saldo negativo · se corrige con un recuento",
    descriptionTone: "error",
  },
};

export const MonospaceText: Story = {
  args: { children: "L-2409", monospace: true, strong: true },
};

export const DetailText: Story = {
  args: {
    children: "Compra del 01/10/2026 · Distribuidora Sur",
    size: "detail",
    tone: "subtle",
  },
};
