import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../forms/button";
import { OtherAmountField } from "../forms/other-amount-field";
import { QuickAmountButton } from "../forms/quick-amount-button";
import { WarningBlock } from "./warning-block";

const meta: Meta<typeof WarningBlock> = {
  title: "Components/WarningBlock",
  component: WarningBlock,
  args: { title: "FALTA DE CAMBIO" },
  decorators: [
    (Story) => (
      <div className="w-90">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WarningBlock>;

export const Default: Story = {
  render: (args) => (
    <WarningBlock {...args}>
      <p className="text-body text-text">Contenido del bloque</p>
    </WarningBlock>
  ),
};

export const WithAction: Story = {
  render: (args) => (
    <WarningBlock
      {...args}
      action={
        <Button variant="text" keycap="F3" onPress={() => {}}>
          Quitar
        </Button>
      }
    >
      <p className="text-body text-text">Contenido del bloque</p>
    </WarningBlock>
  ),
};

export const WithDiscountOptions: Story = {
  render: (args) => (
    <WarningBlock
      {...args}
      action={
        <Button variant="text" keycap="F3" onPress={() => {}}>
          Quitar
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <QuickAmountButton amount="– $ 100,00" selected onPress={() => {}} />
        <OtherAmountField
          label="Otro descuento"
          prefix="– $"
          placeholder="Otro"
          keyName="0"
          value=""
          onChange={() => {}}
        />
      </div>
    </WarningBlock>
  ),
};
