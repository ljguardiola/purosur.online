import { Info } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import type { ButtonIcon } from "./Button";
import {
  NotificationCard,
  type NotificationCardProps,
  type NotificationTone,
} from "./NotificationCard";

type ToneTokens = { border: string; circle: string; icon: string };

const tones: Record<NotificationTone, ToneTokens> = {
  success: { border: "brand-green", circle: "brand-green-message-bg", icon: "brand-green-strong" },
  warning: {
    border: "status-warning-accent",
    circle: "status-warning-message-bg",
    icon: "status-warning-strong",
  },
  error: {
    border: "status-error-accent",
    circle: "status-error-message-bg",
    icon: "status-error-strong",
  },
};

test("renders the caller's title, detail and icon", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Sale completed"
      detail="Receipt printed"
    />,
  );

  await expect.element(screen.getByText("Sale completed", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("Receipt printed", { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector("svg")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a notification without a title", () => {
  expectTypeOf<{
    tone: "success";
    icon: ButtonIcon;
    detail: string;
  }>().not.toExtend<NotificationCardProps>();
});

test("does not accept a notification without a detail", () => {
  expectTypeOf<{
    tone: "success";
    icon: ButtonIcon;
    title: string;
  }>().not.toExtend<NotificationCardProps>();
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Sale completed"
      detail="Receipt printed"
    />,
  );

  // getByRole walks the accessibility tree, which aria-hidden removes an element from: once the
  // visible title/detail are hidden from it, the live region is the only accessible copy left.
  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);

  const region = screen.container.querySelector('[role="status"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale completed Receipt printed");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every tone's border, circle and icon colors, in white with 8px radius and 16px padding", async () => {
  for (const [tone, expected] of Object.entries(tones) as [NotificationTone, ToneTokens][]) {
    const screen = await render(
      <NotificationCard
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        detail={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const circle = icon.parentElement?.parentElement as HTMLElement;
    const style = getComputedStyle(container);

    expect(style.backgroundColor, `${tone} background`).toBe(tokenRgb("surface-white"));
    expect(style.borderRadius, `${tone} radius`).toBe("8px");
    expect(style.paddingTop, `${tone} padding top`).toBe("16px");
    expect(style.paddingLeft, `${tone} padding left`).toBe("16px");
    expect(style.borderLeftWidth, `${tone} border width`).toBe("4px");
    expect(style.borderLeftColor, `${tone} border color`).toBe(tokenRgb(expected.border));
    expect(getComputedStyle(circle).backgroundColor, `${tone} circle`).toBe(
      tokenRgb(expected.circle),
    );
    expect(getComputedStyle(icon).color, `${tone} icon`).toBe(tokenRgb(expected.icon));

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("keeps every tone's icon readable against its own circle", async () => {
  for (const [tone] of Object.entries(tones) as [NotificationTone, ToneTokens][]) {
    const screen = await render(
      <NotificationCard
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        detail={`Detail ${tone}`}
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

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("keeps the title and detail readable against the white background", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" />,
  );
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const detail = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
  const background = tokenRgb("surface-white");

  const titleRatio = contrastRatio(rgbToHex(getComputedStyle(title).color), rgbToHex(background));
  const detailRatio = contrastRatio(rgbToHex(getComputedStyle(detail).color), rgbToHex(background));
  expect(titleRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  expect(detailRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(screen.container);
});

test("centers an 18px icon in a 32px circle, 12px from the text, in a 16px bold ink title and a 14px secondary detail 4px apart", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" />,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const icon = container.querySelector("svg") as SVGSVGElement;
  const circle = icon.parentElement?.parentElement as HTMLElement;
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const detail = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
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
  const detailStyle = getComputedStyle(detail);
  expect(titleStyle.fontSize).toBe("16px");
  expect(titleStyle.fontWeight).toBe("700");
  expect(titleStyle.color).toBe(tokenRgb("ink"));
  expect(detailStyle.fontSize).toBe("14px");
  expect(detailStyle.color).toBe(tokenRgb("ink-secondary"));

  const titleRect = title.getBoundingClientRect();
  const detailRect = detail.getBoundingClientRect();
  const gap = detailRect.top - titleRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders an optional what-to-do line in 14px semibold ink", async () => {
  const screen = await render(
    <NotificationCard
      tone="success"
      icon={<Info />}
      title="Title"
      detail="Detail"
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
  expect(style.color).toBe(tokenRgb("ink"));
  await expectNoAccessibilityViolations(screen.container);
});

test("renders an optional time in 12px secondary text", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" time="14:32" />,
  );
  const time = screen.getByText("14:32", { exact: true }).first().element() as HTMLElement;
  const style = getComputedStyle(time);

  expect(style.fontSize).toBe("12px");
  expect(style.color).toBe(tokenRgb("ink-secondary"));
  await expectNoAccessibilityViolations(screen.container);
});

test("omits the what-to-do and time lines when the caller does not supply them", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" />,
  );

  expect(screen.container.textContent).toBe("TitleDetailTitle Detail");
  await expectNoAccessibilityViolations(screen.container);
});

test("takes its container's width by default", async () => {
  const screen = await render(
    <div style={{ width: "500px" }}>
      <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" />
    </div>,
  );
  const container = screen.container.firstElementChild?.firstElementChild as HTMLElement;

  expect(container.getBoundingClientRect().width).toBeCloseTo(500, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("in floating mode renders 388px wide with the ink-at-12%-opacity shadow", async () => {
  const screen = await render(
    <NotificationCard tone="success" icon={<Info />} title="Title" detail="Detail" floating />,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const rect = container.getBoundingClientRect();
  const boxShadow = getComputedStyle(container).boxShadow;
  // Tailwind's shadow utilities always compose several layers (ring/inset placeholders included),
  // so the token's own layer is picked out of the full list rather than assumed to be the first.
  const inkLayer = boxShadow.split(/,(?![^(]*\))/).find((layer) => layer.includes("26, 26, 26"));

  expect(rect.width).toBeGreaterThan(387);
  expect(rect.width).toBeLessThan(389);
  expect(inkLayer, `no ink shadow layer in: ${boxShadow}`).toBeDefined();

  const match =
    /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+),?\s*([\d.]+)?\)\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/.exec(
      inkLayer as string,
    );
  expect(match, `unexpected box-shadow layer: ${inkLayer}`).not.toBeNull();
  const [, r, g, b, a, x, y, blur] = match as unknown as string[];

  expect(Number(r)).toBe(26);
  expect(Number(g)).toBe(26);
  expect(Number(b)).toBe(26);
  expect(Number(a ?? 1)).toBeCloseTo(0.12, 1);
  expect(Number(x)).toBe(0);
  expect(Number(y)).toBe(6);
  expect(Number(blur)).toBe(20);

  await expectNoAccessibilityViolations(screen.container);
});

test("announces an error tone right away, interrupting current speech", async () => {
  const screen = await render(
    <NotificationCard tone="error" icon={<Info />} title="Payment failed" detail="Try again" />,
  );

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  expect(region).not.toBeNull();

  await expect.poll(() => region.textContent).toContain("Payment failed");
  await expect.poll(() => region.textContent).toContain("Try again");
  await expectNoAccessibilityViolations(screen.container);
});

test("announces success and warning tones politely, after the current speech ends", async () => {
  for (const tone of ["success", "warning"] as const) {
    const screen = await render(
      <NotificationCard tone={tone} icon={<Info />} title="Heads up" detail="Check the totals" />,
    );

    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    const region = screen.container.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();

    await expect.poll(() => region.textContent).toContain("Heads up");
    await expect.poll(() => region.textContent).toContain("Check the totals");
    await expectNoAccessibilityViolations(screen.container);
  }
});
