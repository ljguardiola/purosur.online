import { CalendarDate } from "@internationalized/date";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  playClickExpandsTrigger,
  playHoverSetsDataHovered,
  playPseudoHoverPaintsBoneFill,
  playTabReachesFocusVisible,
  playWithClockAt,
  type StoryPlayFunction,
} from "../../test-support/story-interactions";
import { DateField } from "./date-field";
import { FieldSizeProvider } from "./field-size";
import { fieldErrorClassName } from "./field-styles";

const meta: Meta<typeof DateField> = {
  title: "Components/DateField",
  component: DateField,
  args: {
    label: "Vencimiento",
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DateField>;

function toggle(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button");
}

function fieldBox(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("group");
}

function monthControl(slot: "previous" | "next"): HTMLElement {
  return document.body.querySelector(`[slot="${slot}"]`) as HTMLElement;
}

function monthPicker(): HTMLElement {
  return within(document.body).getByRole("button", { name: /Mes$/ });
}

function yearPicker(): HTMLElement {
  return within(document.body).getByRole("button", { name: /Año$/ });
}

const TODAY_OUTSIDE_SHOWN_MONTHS = "2026-06-15T12:00:00Z";

function playWithTodayOutsideShownMonths(play: StoryPlayFunction): StoryPlayFunction {
  return playWithClockAt(TODAY_OUTSIDE_SHOWN_MONTHS, play);
}

function calendarDay(day: string): HTMLElement {
  const days = Array.from(
    within(document.body).getByRole("dialog").querySelectorAll<HTMLElement>("td [role='button']"),
  );
  return days.find((cell) => cell.textContent?.trim() === day) as HTMLElement;
}

export const Register: Story = {
  args: { value: null },
};

export const RegisterFilled: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
};

export const Backoffice: Story = {
  args: { value: null },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};

export const BackofficeFilled: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};

export const FocusedSegment: Story = {
  args: { value: null },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("group");
    await userEvent.click(group);
    const segment = group.querySelector('[role="spinbutton"]') as HTMLElement;
    await expect(segment).toHaveAttribute("data-focused", "true");
  },
};

export const CalendarToggleFocusVisible: Story = {
  args: { value: null },
  play: playTabReachesFocusVisible(toggle),
};

export const CalendarOpen: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(playClickExpandsTrigger(toggle)),
};

export const CalendarMonthPickerOpen: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await userEvent.click(monthPicker());
    await expect(monthPicker()).toHaveAttribute("aria-expanded", "true");
  }),
};

export const CalendarYearPickerOpen: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await userEvent.click(yearPicker());
    await expect(yearPicker()).toHaveAttribute("aria-expanded", "true");
  }),
};

export const CalendarMonthPickerOutOfRange: Story = {
  args: {
    value: new CalendarDate(2027, 3, 15),
    minValue: new CalendarDate(2027, 2, 10),
    maxValue: new CalendarDate(2027, 4, 20),
    rangeMessage: "La fecha debe estar entre el 10/02/2027 y el 20/04/2027.",
  },
  play: playWithTodayOutsideShownMonths(async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await userEvent.click(monthPicker());
    await expect(within(document.body).getByRole("option", { name: "Enero" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }),
};

export const CalendarPickerHovered: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async (context) => {
    await userEvent.click(toggle(context.canvasElement));
    await playHoverSetsDataHovered(monthPicker)(context);
  }),
};

export const CalendarPickerFocusVisible: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async () => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await expect(yearPicker()).toHaveFocus();
    await expect(yearPicker()).toHaveAttribute("data-focus-visible");
  }),
};

export const CalendarToday: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithClockAt("2027-02-10T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(calendarDay("10")).toHaveAttribute("data-today");
  }),
};

export const CalendarTodayChosen: Story = {
  args: { value: new CalendarDate(2027, 2, 10) },
  play: playWithClockAt("2027-02-10T12:00:00Z", async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(calendarDay("10")).toHaveAttribute("data-today");
  }),
};

export const CalendarMonthControlHovered: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async (context) => {
    await userEvent.click(toggle(context.canvasElement));
    await playHoverSetsDataHovered(() => monthControl("next"))(context);
  }),
};

export const CalendarDayHovered: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async (context) => {
    await userEvent.click(toggle(context.canvasElement));
    await playHoverSetsDataHovered(() => calendarDay("15"))(context);
  }),
};

export const CalendarDayFocusVisible: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async () => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const day = calendarDay("28");
    await expect(day).toHaveFocus();
    await expect(day).toHaveAttribute("data-focus-visible");
  }),
};

export const CalendarMonthControlFocusVisible: Story = {
  args: { value: new CalendarDate(2027, 2, 28) },
  play: playWithTodayOutsideShownMonths(async () => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.tab({ shift: true });
    await expect(monthControl("next")).toHaveFocus();
    await expect(monthControl("next")).toHaveAttribute("data-focus-visible");
  }),
};

export const CalendarMonthControlsDisabled: Story = {
  args: {
    value: new CalendarDate(2027, 2, 15),
    minValue: new CalendarDate(2027, 2, 1),
    maxValue: new CalendarDate(2027, 2, 28),
    rangeMessage: "La fecha debe ser de febrero de 2027.",
  },
  play: playWithTodayOutsideShownMonths(async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(monthControl("previous")).toHaveAttribute("data-disabled");
    await expect(monthControl("next")).toHaveAttribute("data-disabled");
  }),
};

export const CalendarDayOutOfRange: Story = {
  args: {
    value: new CalendarDate(2027, 2, 15),
    minValue: new CalendarDate(2027, 2, 10),
    maxValue: new CalendarDate(2027, 2, 20),
    rangeMessage: "La fecha debe estar entre el 10/02/2027 y el 20/02/2027.",
  },
  play: playWithTodayOutsideShownMonths(async ({ canvasElement }) => {
    await userEvent.click(toggle(canvasElement));
    await expect(calendarDay("5")).toHaveAttribute("data-disabled");
  }),
};

export const Hovered: Story = {
  args: { value: null },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const HoveredBackoffice: Story = {
  args: { value: null },
  parameters: { pseudo: { hover: true } },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
  play: playPseudoHoverPaintsBoneFill(fieldBox),
};

export const Disabled: Story = {
  args: { value: null, disabled: true },
};

export const Required: Story = {
  args: { value: null, required: true },
};

export const Invalid: Story = {
  args: { value: null, errorMessage: "Elegí una fecha." },
};

function DateFieldWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <DateField label="Vencimiento" value={null} onChange={() => {}} errorMessageId={messageId} />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí una fecha.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <DateFieldWithMessageElsewhere />,
};

export const OutOfRange: Story = {
  args: {
    value: new CalendarDate(2027, 3, 15),
    minValue: new CalendarDate(2027, 1, 1),
    maxValue: new CalendarDate(2027, 2, 28),
    rangeMessage: "La fecha debe ser 28/02/2027 o anterior.",
  },
};

export const HelperText: Story = {
  args: {
    value: null,
    description: "Un vencimiento distinto para el mismo producto se carga como otra línea.",
  },
};
