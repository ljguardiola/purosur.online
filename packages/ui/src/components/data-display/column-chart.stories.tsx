import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColumnChart } from "./column-chart";

const meta: Meta<typeof ColumnChart> = {
  title: "Components/ColumnChart",
  component: ColumnChart,
  args: {
    formatValue: (value: number) => `$${value.toLocaleString("es-AR")}`,
    emptyMessage: "Todavía no hay ventas.",
  },
};

export default meta;

type Story = StoryObj<typeof ColumnChart>;

export const Default: Story = {
  args: {
    bars: [
      { id: "lun", label: "Lun", value: 214300 },
      { id: "mar", label: "Mar", value: 90000 },
      { id: "mie", label: "Mié", value: 150000 },
      { id: "jue", label: "Jue", value: 60000 },
    ],
  },
};

export const SingleBar: Story = {
  args: { bars: [{ id: "total", label: "Total", value: 214300 }] },
};

export const WithoutLabels: Story = {
  args: {
    bars: [
      { id: "a", value: 214300 },
      { id: "b", value: 90000 },
      { id: "c", value: 150000 },
    ],
  },
};

export const LongLabel: Story = {
  args: {
    bars: [
      {
        id: "a",
        label: "Un rótulo demasiado largo para entrar en el espacio que el gráfico le reserva",
        value: 100,
      },
      { id: "b", label: "Medio", value: 80 },
      { id: "c", label: "Corto", value: 60 },
    ],
  },
};

export const Empty: Story = {
  args: { bars: [] },
};
