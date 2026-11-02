import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextPreview } from "./text-preview";

const meta: Meta<typeof TextPreview> = {
  title: "Components/TextPreview",
  component: TextPreview,
  decorators: [
    (Story) => (
      <div className="w-160 bg-surface p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TextPreview>;

export const MultiLine: Story = {
  args: {
    text: [
      "Pedido a Distribuidora Andina",
      "Fecha: 05/10/2026",
      "",
      "1. Miel pura de abeja 1 kg",
      "   3 paquetes de 12 u",
      "   Artículo del proveedor: MIEL-1K - Miel pura x 12 frascos",
      "2. Avena arrollada",
      "   2 paquetes de 25 kg",
    ].join("\n"),
  },
};

export const LongLine: Story = {
  args: {
    text: `Pedido a Distribuidora ${"del Sur ".repeat(20)}\nFecha: 05/10/2026`,
  },
};
