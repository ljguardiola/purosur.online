import { LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { AreaNavItem, type AreaNavItemProps } from "./AreaNavItem";

// Contrast assertions need the rail's real background, not the page's default subtle surface.
function Rail({ children }: { children: ReactNode }) {
  return <div className="bg-surface-nav p-2">{children}</div>;
}

function renderItem(props: Omit<AreaNavItemProps, "icon">) {
  return render(
    <Rail>
      <AreaNavItem icon={<LifeBuoy />} {...props} />
    </Rail>,
  );
}

test("renders as a link naming its own label, with the icon hidden from assistive technology", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/help");
  expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("marks the active item with aria-current and paints it in the inverse text color over the subtle nav surface", async () => {
  const screen = await renderItem({ label: "Ayuda", active: true, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenBackgroundColor("surface-nav-subtle"));

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-inverse"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
});

test("leaves an inactive item with no aria-current, painted in the subtle inverse text color with no background", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-inverse-subtle"));
  expect(getComputedStyle(label).fontWeight).toBe("400");
});

test("forwards a click handler, so the app can drive its own router", async () => {
  let clicked = false;
  const screen = await renderItem({
    label: "Ayuda",
    active: false,
    href: "/help",
    onClick: (event) => {
      event.preventDefault();
      clicked = true;
    },
  });

  screen
    .getByRole("link", { name: "Ayuda" })
    .element()
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

  expect(clicked).toBe(true);
});
