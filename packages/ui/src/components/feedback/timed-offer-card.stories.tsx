import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Printer } from "lucide-react";
import { TimedOfferCard } from "./timed-offer-card";

const meta: Meta<typeof TimedOfferCard> = {
  title: "Components/TimedOfferCard",
  component: TimedOfferCard,
  args: {
    icon: <Printer />,
    title: "¿Imprimir ticket?",
    skip: { label: "Omitir", onPress: () => {} },
    countdown: { remainingSeconds: 3, totalSeconds: 3, label: "Tiempo para imprimir" },
    accept: { label: "Sí", icon: <Check />, onPress: () => {} },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "350px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TimedOfferCard>;

export const Offered: Story = {};

export const CountingDown: Story = {
  args: { countdown: { remainingSeconds: 1, totalSeconds: 3, label: "Tiempo para imprimir" } },
};

export const AnswerBeingSent: Story = {
  args: { accept: { label: "Sí", icon: <Check />, onPress: () => {}, disabled: true } },
};
