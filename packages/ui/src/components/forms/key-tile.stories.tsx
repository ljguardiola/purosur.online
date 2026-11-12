import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreditCard, QrCode } from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { KeyTile } from "./key-tile";

const meta: Meta<typeof KeyTile> = {
  title: "Components/KeyTile",
  component: KeyTile,
  args: { label: "Point débito", icon: <CreditCard />, keyName: "F9", onPress: () => {} },
  decorators: [
    (Story) => (
      <div className="w-28">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof KeyTile>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const DisabledWithReason: Story = {
  args: { disabledReason: "No disponible sin conexión" },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button")).toHaveFocus();
    await waitFor(() => {
      expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
    });
  },
};

export const PaymentTiles: Story = {
  decorators: [
    () => (
      <div className="grid w-90 grid-cols-3 gap-3">
        <KeyTile label="Point débito" icon={<CreditCard />} keyName="F9" onPress={() => {}} />
        <KeyTile label="Point crédito" icon={<CreditCard />} keyName="F10" onPress={() => {}} />
        <KeyTile label="QR" icon={<QrCode />} keyName="F11" onPress={() => {}} />
      </div>
    ),
  ],
};
