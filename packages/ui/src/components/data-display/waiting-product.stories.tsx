import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaitingProduct } from "./waiting-product";

const meta: Meta<typeof WaitingProduct> = {
  title: "Components/WaitingProduct",
  component: WaitingProduct,
  args: {
    label: "En espera",
    name: "Aceite de oliva extra virgen 500 ml",
    detail: "$ 9.400,00 / u",
    discardLabel: "Descartar",
    onDiscard: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof WaitingProduct>;

export const Default: Story = {};

export const LongName: Story = {
  args: { name: "Mezcla de frutos secos, semillas y cereales sin sal agregada, bolsa de un kilo" },
};
