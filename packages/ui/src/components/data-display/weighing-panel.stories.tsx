import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaitingProduct } from "./waiting-product";
import { WeighingPanel } from "./weighing-panel";
import { WeightReadout } from "./weight-readout";

const meta: Meta<typeof WeighingPanel> = {
  title: "Components/WeighingPanel",
  component: WeighingPanel,
  args: {
    title: "Nueces mariposa",
    detail: "$ 16.400,00 / kg",
    status: "stable",
    statusLabel: "Estable",
    cancelLabel: "Cancelar",
    onCancel: () => {},
    children: (
      <WeightReadout
        weightLabel="Peso"
        weight="0,172 kg"
        amountLabel="Importe"
        amount="$ 2.820,80"
        settled
      />
    ),
  },
};

export default meta;

type Story = StoryObj<typeof WeighingPanel>;

export const Stable: Story = {};

export const Moving: Story = {
  args: {
    status: "moving",
    statusLabel: "Moviéndose",
    children: (
      <WeightReadout
        weightLabel="Peso"
        weight="0,238 kg"
        amountLabel="Importe"
        amount="$ 1.856,40"
        settled={false}
      />
    ),
  },
};

export const WithoutDetail: Story = { args: { detail: undefined } };

export const WithWaitingProduct: Story = {
  args: {
    waiting: (
      <WaitingProduct
        label="En espera"
        name="Aceite de oliva extra virgen 500 ml"
        detail="$ 9.400,00 / u"
        discardLabel="Descartar"
        onDiscard={() => {}}
      />
    ),
  },
};
