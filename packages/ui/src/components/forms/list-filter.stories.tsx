import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playArrowKeyFocusesListboxOption,
  playClickExpandsTrigger,
  playHoverListboxOption,
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { ListFilter } from "./list-filter";
import type { Option } from "./option";

type Status = "all" | "open" | "closed";

const options: [Option<Status>, Option<Status>, Option<Status>] = [
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

export const Hovered: Story = {
  play: playHoverSetsDataHovered(trigger),
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
