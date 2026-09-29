import { Info } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, NON_TEXT_CONTRAST } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import type { NoticeTone } from "../shared/tone";
import { NotificationCard, type NotificationCardProps } from "./notification-card";

type ToneTokens = { border: string; circle: string; icon: string };

const tones: Record<NoticeTone, ToneTokens> = {
  info: { border: "info-soft", circle: "info-subtle", icon: "info-strong" },
  success: { border: "success-soft", circle: "success-subtle", icon: "success-strong" },
  warning: {
    border: "warning-soft",
    circle: "warning-subtle",
    icon: "warning-strong",
  },
  error: {
    border: "error-soft",
    circle: "error-subtle",
    icon: "error-strong",
  },
};

test("renders the caller's title, description and icon", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Sale completed"
      description="Receipt printed"
    />,
  );

  await expect.element(screen.getByText("Sale completed", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("Receipt printed", { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector("svg")).not.toBeNull();
});

test("does not accept a notification without a title", () => {
  expectTypeOf<{
    tone: "success";
    icon: Icon;
    description: string;
  }>().not.toExtend<NotificationCardProps>();
});

test("does not accept a notification without a description", () => {
  expectTypeOf<{
    tone: "success";
    icon: Icon;
    title: string;
  }>().not.toExtend<NotificationCardProps>();
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Sale completed"
      description="Receipt printed"
    />,
  );

  // aria-hidden removes an element from the accessibility tree that getByRole walks.
  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);

  const region = screen.container.querySelector('[role="status"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale completed Receipt printed");
});

test("renders every tone's border, circle and icon colors, in white with 8px radius and 16px padding", async () => {
  for (const [tone, expected] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <NotificationCard
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        description={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const circle = icon.parentElement?.parentElement as HTMLElement;
    const style = getComputedStyle(container);

    expect(style.backgroundColor, `${tone} background`).toBe(tokenRgb("surface"));
    expect(style.borderRadius, `${tone} radius`).toBe("8px");
    expect(style.paddingTop, `${tone} padding top`).toBe("16px");
    expect(style.paddingLeft, `${tone} padding left`).toBe("16px");
    expect(style.borderLeftWidth, `${tone} border width`).toBe("4px");
    expect(style.borderLeftColor, `${tone} border color`).toBe(tokenRgb(expected.border));
    expect(getComputedStyle(circle).backgroundColor, `${tone} circle`).toBe(
      tokenRgb(expected.circle),
    );
    expect(getComputedStyle(icon).color, `${tone} icon`).toBe(tokenRgb(expected.icon));
  }
});

test("keeps every tone's icon readable against its own circle", async () => {
  for (const [tone] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <NotificationCard
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        description={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const circle = icon.parentElement?.parentElement as HTMLElement;

    const ratio = contrastRatio(
      rgbToHex(getComputedStyle(icon).color),
      rgbToHex(getComputedStyle(circle).backgroundColor),
    );
    expect(ratio, `${tone} contrast`).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  }
});

test("keeps the title and description readable against the white background", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" description="Detail" />,
  );
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const description = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
  const background = tokenRgb("surface");

  const titleRatio = contrastRatio(rgbToHex(getComputedStyle(title).color), rgbToHex(background));
  const descriptionRatio = contrastRatio(
    rgbToHex(getComputedStyle(description).color),
    rgbToHex(background),
  );
  expect(titleRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  expect(descriptionRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
});

test("centers an 18px icon in a 32px circle, 12px from the text, in a 16px bold ink title and a 14px secondary description 4px apart", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" description="Detail" />,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const icon = container.querySelector("svg") as SVGSVGElement;
  const circle = icon.parentElement?.parentElement as HTMLElement;
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const description = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
  const textStack = title.parentElement as HTMLElement;

  const circleRect = circle.getBoundingClientRect();
  expect(circleRect.width).toBeGreaterThan(31);
  expect(circleRect.width).toBeLessThan(33);
  expect(circleRect.height).toBeGreaterThan(31);
  expect(circleRect.height).toBeLessThan(33);
  // Tailwind's rounded-full computes to a huge radius (clipped by the element's own size), not a
  // fixed pixel value, so this checks it's circular rather than matching an exact number.
  expect(Number.parseFloat(getComputedStyle(circle).borderRadius)).toBeGreaterThan(1000);

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);

  const textRect = textStack.getBoundingClientRect();
  expect(textRect.left - circleRect.right).toBeGreaterThan(11);
  expect(textRect.left - circleRect.right).toBeLessThan(13);

  const titleStyle = getComputedStyle(title);
  const descriptionStyle = getComputedStyle(description);
  expect(titleStyle.fontSize).toBe("16px");
  expect(titleStyle.fontWeight).toBe("700");
  expect(titleStyle.color).toBe(tokenRgb("text"));
  expect(descriptionStyle.fontSize).toBe("14px");
  expect(descriptionStyle.color).toBe(tokenRgb("text-subtle"));

  const titleRect = title.getBoundingClientRect();
  const descriptionRect = description.getBoundingClientRect();
  const gap = descriptionRect.top - titleRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);
});

test("renders an optional what-to-do line in 14px semibold ink", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      description="Detail"
      whatToDo="Print another receipt"
    />,
  );
  const whatToDo = screen
    .getByText("Print another receipt", { exact: true })
    .first()
    .element() as HTMLElement;
  const style = getComputedStyle(whatToDo);

  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("600");
  expect(style.color).toBe(tokenRgb("text"));
});

test("renders an optional time in 12px secondary text", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      description="Detail"
      time="14:32"
    />,
  );
  const time = screen.getByText("14:32", { exact: true }).first().element() as HTMLElement;
  const style = getComputedStyle(time);

  expect(style.fontSize).toBe("12px");
  expect(style.color).toBe(tokenRgb("text-subtle"));
});

test("omits the what-to-do and time lines when the caller does not supply them", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" description="Detail" />,
  );

  await expect.poll(() => screen.container.textContent).toBe("TitleDetailTitle Detail");
});

test("takes its container's width by default", async () => {
  const screen = await render(
    <div style={{ width: "500px" }}>
      <NotificationCard tone="success" icon={<Info />} title="Title" description="Detail" />
    </div>,
  );
  const container = screen.container.firstElementChild?.firstElementChild as HTMLElement;

  expect(container.getBoundingClientRect().width).toBeCloseTo(500, 0);
});

test("shows no close button unless it is given a way to close", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" description="Detail" />,
  );

  expect(screen.getByRole("button").elements()).toEqual([]);
});

test("closes through a 'Cerrar' button that calls onClose", async () => {
  const onClose = vi.fn();
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      description="Detail"
      onClose={onClose}
    />,
  );

  await screen.getByRole("button", { name: "Cerrar" }).click();

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("places the close button at the card's top-right corner", async () => {
  const screen = await render(
    <div style={{ width: "400px" }}>
      <NotificationCard
        tone="success"
        icon={<Info />}
        title="Title"
        description="Detail"
        whatToDo="Do this"
        onClose={() => {}}
      />
    </div>,
  );
  const card = screen.container.firstElementChild?.firstElementChild as HTMLElement;
  const button = screen.getByRole("button", { name: "Cerrar" }).element();
  const cardRect = card.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  expect(cardRect.right - buttonRect.right).toBeLessThan(20);
  expect(buttonRect.top - cardRect.top).toBeLessThan(20);
});

test("keeps the announced text unchanged when it can be closed", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      description="Detail"
      onClose={() => {}}
    />,
  );

  await expect.poll(() => screen.container.textContent).toBe("TitleDetailTitle Detail");
});

test("has no accessibility violations when it can be closed", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      description="Detail"
      onClose={() => {}}
    />,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("announces an error tone right away, interrupting current speech", async () => {
  const screen = await render(
    <NotificationCard
      tone="error"
      icon={<Info />}
      title="Payment failed"
      description="Try again"
    />,
  );

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  expect(region).not.toBeNull();

  await expect.poll(() => region.textContent).toContain("Payment failed");
  await expect.poll(() => region.textContent).toContain("Try again");
});

test("announces success and warning tones politely, after the current speech ends", async () => {
  for (const tone of ["success", "warning"] as const) {
    const screen = await render(
      <NotificationCard
        tone={tone}
        icon={<Info />}
        title="Heads up"
        description="Check the totals"
      />,
    );

    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    const region = screen.container.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();

    await expect.poll(() => region.textContent).toContain("Heads up");
    await expect.poll(() => region.textContent).toContain("Check the totals");
  }
});

test("does not name its secondary text detail", () => {
  expectTypeOf<NotificationCardProps>().not.toHaveProperty("detail");
});
