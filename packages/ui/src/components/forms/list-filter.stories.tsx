import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playArrowKeyFocusesListboxOption,
  playClickExpandsTrigger,
  playHoverListboxOption,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { ListFilter, type ListFilterOption } from "./list-filter";

type Status = "all" | "open" | "closed";

const options: [ListFilterOption<Status>, ListFilterOption<Status>, ListFilterOption<Status>] = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertas" },
  { value: "closed", label: "Cerradas" },
];

const meta: Meta<typeof ListFilter<Status>> = {
  title: "Components/ListFilter",
  component: ListFilter<Status>,
  args: {
    label: "Estado",
    options,
    value: "all",
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ListFilter<Status>>;

function trigger(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: /Estado/ });
}

export const Closed: Story = {};

export const Open: Story = {
  play: playClickExpandsTrigger(trigger),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(trigger),
};

export const OptionHovered: Story = {
  play: playHoverListboxOption(trigger, "Abiertas"),
};

export const OptionFocusVisible: Story = {
  play: playArrowKeyFocusesListboxOption(trigger, "Abiertas"),
};
