import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../forms/button";
import { ProductCard } from "./product-card";

const meta: Meta<typeof ProductCard> = {
  title: "Components/ProductCard",
  component: ProductCard,
  decorators: [
    (Story) => (
      <div className="w-[850px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ProductCard>;

const weightFigures = [
  { label: "Peso", value: "0,410 kg" },
  { label: "Importe", value: "$ 6.974,10" },
  { label: "Stock", value: "12,4 kg" },
];

export const ByWeightWithPromotion: Story = {
  args: {
    name: "Almendras peladas",
    price: "$ 18.900,00 / kg",
    soldBy: "weight",
    tag: "10 % los martes",
    figures: weightFigures,
    action: <Button keycap="Enter">Agregar a la venta</Button>,
  },
};

export const ByUnit: Story = {
  args: {
    name: "Aceite de oliva 500 ml",
    price: "$ 9.500,00 / u",
    soldBy: "unit",
    figures: [{ label: "Stock", value: "24 u" }],
    action: <Button keycap="Enter">Agregar a la venta</Button>,
  },
};

export const WithoutAction: Story = {
  args: { name: "Aceite de oliva 500 ml", price: "$ 9.500,00 / u", soldBy: "unit", figures: [] },
};
