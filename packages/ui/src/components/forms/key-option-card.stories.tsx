import type { Meta, StoryObj } from "@storybook/react-vite";
import { Calculator, Landmark } from "lucide-react";
import { KeyOptionCard } from "./key-option-card";

const meta: Meta<typeof KeyOptionCard> = {
  title: "Components/KeyOptionCard",
  component: KeyOptionCard,
  args: { label: "Transferencia", icon: <Landmark />, keyName: "1", onPress: () => {} },
  decorators: [
    (Story) => (
      <div className="w-88">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof KeyOptionCard>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const OtherMethods: Story = {
  decorators: [
    () => (
      <div className="flex w-88 flex-col gap-3">
        <KeyOptionCard label="Transferencia" icon={<Landmark />} keyName="1" onPress={() => {}} />
        <KeyOptionCard
          label="Terminal independiente"
          icon={<Calculator />}
          keyName="2"
          onPress={() => {}}
        />
      </div>
    ),
  ],
};
