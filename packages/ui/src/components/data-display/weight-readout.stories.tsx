import type { Meta, StoryObj } from "@storybook/react-vite";
import { WeightReadout } from "./weight-readout";

const meta: Meta<typeof WeightReadout> = {
  title: "Components/WeightReadout",
  component: WeightReadout,
  args: {
    weightLabel: "Peso",
    weight: "0,172 kg",
    amountLabel: "Importe",
    amount: "$ 2.820,80",
    settled: true,
  },
};

export default meta;

type Story = StoryObj<typeof WeightReadout>;

export const Settled: Story = {};

export const Moving: Story = {
  args: { weight: "0,238 kg", amount: "$ 1.856,40", settled: false },
};
