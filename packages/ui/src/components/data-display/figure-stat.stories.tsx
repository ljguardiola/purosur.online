import type { Meta, StoryObj } from "@storybook/react-vite";
import { FigureStat } from "./figure-stat";

const meta: Meta<typeof FigureStat> = {
  title: "Components/FigureStat",
  component: FigureStat,
  args: { label: "Vuelto", value: "$ 1.500,00" },
};

export default meta;

type Story = StoryObj<typeof FigureStat>;

export const Default: Story = {};

export const WithDetail: Story = {
  args: { label: "Vuelto a entregar", detail: "$ 10.000,00 − $ 8.500,00" },
};

export const HeadingSize: Story = {
  args: { size: "heading", label: "Contado" },
};

export const Loading: Story = {
  args: { label: "Efectivo esperado", loading: true, value: undefined },
};
