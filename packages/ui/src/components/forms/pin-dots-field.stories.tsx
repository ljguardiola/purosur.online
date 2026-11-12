import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
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

function FieldWithMessageElsewhere({ focused = false }: { focused?: boolean }) {
  const messageId = useId();
  return (
    <>
      <PinDotsField
        label="PIN"
        value="1234"
        onChange={() => {}}
        errorMessageId={messageId}
        autoFocus={focused}
        errorRingWhileFocused={focused}
      />
      <p id={messageId} className={fieldErrorClassName}>
        PIN incorrecto
      </p>
    </>
  );
}

export const Invalid: Story = {
  render: () => <FieldWithMessageElsewhere />,
};

export const InvalidKeepingErrorRingWhileFocused: Story = {
  render: () => <FieldWithMessageElsewhere focused />,
};

export const Disabled: Story = {
  args: { value: "1234", disabled: true },
};
