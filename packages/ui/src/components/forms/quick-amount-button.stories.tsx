import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickAmountButton } from "./quick-amount-button";

const meta: Meta<typeof QuickAmountButton> = {
  title: "Components/QuickAmountButton",
  component: QuickAmountButton,
  args: { amount: "$ 26.000,00", keyName: "F7", onPress: () => {} },
  decorators: [
    (Story) => (
      <div className="w-43">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof QuickAmountButton>;

export const Default: Story = {};

export const Exact: Story = { args: { label: "JUSTO", amount: "$ 25.100,00", keyName: "F6" } };

export const Selected: Story = { args: { amount: "$ 30.000,00", keyName: "F8", selected: true } };

export const WithoutKey: Story = { args: { amount: "– $ 100,00", keyName: undefined } };

export const Disabled: Story = { args: { disabled: true } };

export const QuickAmounts: Story = {
  decorators: [
    () => (
      <div className="grid w-90 grid-cols-2 gap-3">
        <QuickAmountButton label="JUSTO" amount="$ 25.100,00" keyName="F6" onPress={() => {}} />
        <QuickAmountButton amount="$ 26.000,00" keyName="F7" onPress={() => {}} />
        <QuickAmountButton amount="$ 30.000,00" keyName="F8" selected onPress={() => {}} />
        <QuickAmountButton amount="$ 40.000,00" keyName="F9" onPress={() => {}} />
      </div>
    ),
  ],
};
