import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
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

const brandOptions: [Option<string>, Option<string>, Option<string>, Option<string>] = [
  { value: "all", label: "Todas" },
  { value: "acme", label: "Acme" },
  { value: "zenit", label: "Zenit" },
  { value: "zafiro", label: "Zafiro" },
];

const searchableArgs = {
  label: "Marca",
  options: brandOptions,
  value: "acme",
  searchable: true,
};

function brandInput(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("combobox", { name: /Marca/ });
}

export const SearchableClosed: StoryObj<typeof ListFilter<string>> = {
  args: searchableArgs,
};

export const SearchableTyping: StoryObj<typeof ListFilter<string>> = {
  args: searchableArgs,
  play: async ({ canvasElement }) => {
    const input = brandInput(canvasElement);
    await userEvent.clear(input);
    await userEvent.type(input, "z");
  },
};

export const SearchableNoResults: StoryObj<typeof ListFilter<string>> = {
  args: searchableArgs,
  play: async ({ canvasElement }) => {
    const input = brandInput(canvasElement);
    await userEvent.clear(input);
    await userEvent.type(input, "qqq");
  },
};
