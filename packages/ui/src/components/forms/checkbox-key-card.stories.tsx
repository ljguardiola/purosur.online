import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { CheckboxKeyCard } from "./checkbox-key-card";

const meta: Meta<typeof CheckboxKeyCard> = {
  title: "Components/CheckboxKeyCard",
  component: CheckboxKeyCard,
  args: {
    name: "ticketChecked",
    label: "Ticket verificado",
    keyName: "T",
    onCheckedChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-88">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CheckboxKeyCard>;

function cardInput(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("checkbox");
}

function cardRoot(canvasElement: HTMLElement): HTMLElement {
  return cardInput(canvasElement).closest("label") as HTMLElement;
}

export const Unchecked: Story = {
  args: { checked: false },
};

export const Checked: Story = {
  args: { checked: true },
};

export const Disabled: Story = {
  args: { checked: false, disabled: true },
};

export const UncheckedHovered: Story = {
  args: { checked: false },
  play: playHoverSetsDataHovered(cardRoot),
};

export const FocusVisible: Story = {
  args: { checked: false },
  play: playTabReachesFocusVisible(cardInput, cardRoot),
};
