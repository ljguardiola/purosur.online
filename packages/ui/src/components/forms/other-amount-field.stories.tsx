import type { Meta, StoryObj } from "@storybook/react-vite";
import { OtherAmountField } from "./other-amount-field";

const meta: Meta<typeof OtherAmountField> = {
  title: "Components/OtherAmountField",
  component: OtherAmountField,
  args: {
    label: "Otro descuento",
    prefix: "– $",
    placeholder: "Otro",
    keyName: "0",
    value: "",
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-43">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OtherAmountField>;

export const Empty: Story = {};

export const Filled: Story = { args: { value: "150,00", selected: true } };

export const Invalid: Story = {
  args: { value: "99999999,00", errorMessage: "El descuento no puede ser mayor al total." },
};

export const Disabled: Story = { args: { disabled: true } };
