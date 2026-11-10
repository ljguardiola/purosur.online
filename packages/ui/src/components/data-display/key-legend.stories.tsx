import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyLegend } from "./key-legend";

const meta: Meta<typeof KeyLegend> = {
  title: "Components/KeyLegend",
  component: KeyLegend,
  args: {
    items: [
      { keyName: "ArrowUpDown", label: "Líneas" },
      { keyName: "F2", label: "Buscar" },
      { keyName: "F3", label: "Pesar" },
      { keyName: "F4", label: "Consulta" },
      { keyName: "F6", label: "Precio" },
      { keyName: "F7", label: "Descuento" },
      { keyName: "F8", label: "Vaciar" },
      { keyName: "Delete", label: "Quitar" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof KeyLegend>;

export const Default: Story = {};

export const InCardFooter: Story = {
  decorators: [
    (Story) => (
      <div className="w-208 rounded-b-lg border-t border-border bg-surface-subtle px-4 py-3">
        <Story />
      </div>
    ),
  ],
};

export const Short: Story = {
  args: {
    items: [
      { keyName: "Enter", label: "Confirmar" },
      { keyName: "Escape", label: "Volver" },
    ],
  },
};
