import type { Meta, StoryObj } from "@storybook/react-vite";
import { fieldErrorClassName } from "./field-styles";
import { PinDotsField } from "./pin-dots-field";

const meta: Meta<typeof PinDotsField> = {
  title: "Components/PinDotsField",
  component: PinDotsField,
  args: { label: "PIN", value: "", onChange: () => {} },
  decorators: [
    (Story) => (
      <div className="w-110">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PinDotsField>;

export const Empty: Story = {};

export const FourTyped: Story = {
  args: { value: "1234" },
};

export const EightTyped: Story = {
  args: { value: "12345678" },
};

export const Invalid: Story = {
  args: { value: "1234", errorMessageId: "pin-error" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <p id="pin-error" className={fieldErrorClassName}>
          PIN incorrecto
        </p>
      </>
    ),
  ],
};

export const Disabled: Story = {
  args: { value: "1234", disabled: true },
};
