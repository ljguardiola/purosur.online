import { createRef, type MouseEvent } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Tab, Tabs } from "./tabs";

type FollowedLink = { href: string | null; ctrlKey: boolean };

function followLinks() {
  const followed: FollowedLink[] = [];
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!event.defaultPrevented) {
      followed.push({ href: event.currentTarget.getAttribute("href"), ctrlKey: event.ctrlKey });
    }
    event.preventDefault();
  };
  return { followed, onClick };
}

type PeopleTabsProps = {
  selectedTab?: string;
  disabledTab?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function PeopleTabs({ selectedTab = "users", disabledTab, onClick }: PeopleTabsProps) {
  return (
    <Tabs
      label="Secciones de Personas"
      selectedTab={selectedTab}
      tabs={
        <>
          <Tab value="users" label="Usuarios" href="/people/users" onClick={onClick} />
          <Tab
            value="roles"
            label="Roles"
            href="/people/roles"
            isDisabled={disabledTab === "roles"}
            onClick={onClick}
          />
          <Tab value="devices" label="Dispositivos" href="/people/devices" onClick={onClick} />
        </>
      }
    >
      <p>Contenido de {selectedTab}</p>
      <button type="button">Nuevo usuario</button>
    </Tabs>
  );
}

function tab(screen: Awaited<ReturnType<typeof render>>, name: string) {
  return screen.getByRole("tab", { name, exact: true });
}

test("lists each tab in a tab list named by its label, each linking to its own route", async () => {
  const screen = await render(<PeopleTabs />);

  await expect
    .element(screen.getByRole("tablist", { name: "Secciones de Personas" }))
    .toBeInTheDocument();
  expect(tab(screen, "Usuarios").element().getAttribute("href")).toBe("/people/users");
  expect(tab(screen, "Roles").element().getAttribute("href")).toBe("/people/roles");
  expect(tab(screen, "Dispositivos").element().getAttribute("href")).toBe("/people/devices");
});

test("selects the tab the current route names and shows the content in its panel", async () => {
  const screen = await render(<PeopleTabs selectedTab="roles" />);

  await expect.element(tab(screen, "Roles")).toHaveAttribute("aria-selected", "true");
  await expect.element(tab(screen, "Usuarios")).toHaveAttribute("aria-selected", "false");
  const panel = screen.getByRole("tabpanel", { name: "Roles" });
  await expect.element(panel.getByText("Contenido de roles")).toBeInTheDocument();
  expect(tab(screen, "Roles").element().getAttribute("aria-controls")).toBe(
    panel.element().getAttribute("id"),
  );
});

test("moves the selection when the current route changes", async () => {
  const screen = await render(<PeopleTabs selectedTab="users" />);

  await screen.rerender(<PeopleTabs selectedTab="devices" />);

  await expect.element(tab(screen, "Dispositivos")).toHaveAttribute("aria-selected", "true");
  await expect.element(tab(screen, "Usuarios")).toHaveAttribute("aria-selected", "false");
});

test("keeps the selection on the current route's tab when a pressed tab's link leaves the route as it is", async () => {
  const { onClick } = followLinks();
  const screen = await render(<PeopleTabs selectedTab="users" onClick={onClick} />);

  await userEvent.click(tab(screen, "Roles"));

  await expect.element(tab(screen, "Usuarios")).toHaveAttribute("aria-selected", "true");
  await expect.element(tab(screen, "Roles")).toHaveAttribute("aria-selected", "false");
});

test("hands a pressed tab's link exactly one click it can still handle", async () => {
  const { followed, onClick } = followLinks();
  const screen = await render(<PeopleTabs onClick={onClick} />);

  await userEvent.click(tab(screen, "Roles"));

  await expect.poll(() => followed).toEqual([{ href: "/people/roles", ctrlKey: false }]);
});

test("hands the link the modifier pressed with the tab, so it can open in a new browser tab", async () => {
  const { followed, onClick } = followLinks();
  const screen = await render(<PeopleTabs onClick={onClick} />);

  await userEvent.click(tab(screen, "Roles"), { modifiers: ["Control"] });

  await expect.poll(() => followed.map((link) => link.ctrlKey)).toEqual([true]);
});

test("moves the focus between tabs with the arrow keys, Home and End, without following any link", async () => {
  const { followed, onClick } = followLinks();
  const screen = await render(<PeopleTabs onClick={onClick} />);

  await userEvent.tab();
  await expect.element(tab(screen, "Usuarios")).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab(screen, "Roles")).toHaveFocus();
  await userEvent.keyboard("{End}");
  await expect.element(tab(screen, "Dispositivos")).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab(screen, "Usuarios")).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(tab(screen, "Dispositivos")).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(tab(screen, "Usuarios")).toHaveFocus();

  expect(followed).toEqual([]);
  await expect.element(tab(screen, "Usuarios")).toHaveAttribute("aria-selected", "true");
});

test("follows the focused tab's link with Enter", async () => {
  const { followed, onClick } = followLinks();
  await render(<PeopleTabs onClick={onClick} />);

  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => followed).toEqual([{ href: "/people/roles", ctrlKey: false }]);
});

test("follows the focused tab's link with Space", async () => {
  const { followed, onClick } = followLinks();
  const screen = await render(<PeopleTabs onClick={onClick} />);

  await userEvent.tab();
  await userEvent.keyboard("{End}");
  await userEvent.keyboard(" ");

  await expect.poll(() => followed.map((link) => link.href)).toEqual(["/people/devices"]);
  await expect.element(tab(screen, "Dispositivos")).toHaveFocus();
});

test("keeps only the selected tab in the Tab sequence, from which Tab moves into the panel", async () => {
  const screen = await render(<PeopleTabs selectedTab="roles" />);

  await userEvent.tab();
  await expect.element(tab(screen, "Roles")).toHaveFocus();
  await userEvent.tab();

  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toHaveFocus();
});

test("announces a disabled tab, skips it with the arrow keys and follows no link when it is pressed", async () => {
  const { followed, onClick } = followLinks();
  const screen = await render(<PeopleTabs disabledTab="roles" onClick={onClick} />);

  await expect.element(tab(screen, "Roles")).toHaveAttribute("aria-disabled", "true");
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab(screen, "Dispositivos")).toHaveFocus();
  await userEvent.click(tab(screen, "Roles"), { force: true });

  expect(followed).toEqual([]);
  await expect.element(tab(screen, "Roles")).not.toHaveFocus();
});

test("leaves a disabled tab out of the Tab sequence", async () => {
  const screen = await render(<PeopleTabs selectedTab="users" disabledTab="roles" />);

  await userEvent.tab();
  await expect.element(tab(screen, "Usuarios")).toHaveFocus();
  await userEvent.tab();

  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toHaveFocus();
});

test("passes a style and a ref to the tab's link, so a router can apply its own styles and preload", async () => {
  const ref = createRef<HTMLAnchorElement>();
  const screen = await render(
    <Tabs
      label="Secciones de Personas"
      selectedTab="users"
      tabs={
        <Tab
          value="users"
          label="Usuarios"
          href="/people/users"
          style={{ opacity: 0.5 }}
          ref={ref}
        />
      }
    >
      <p>Usuarios</p>
    </Tabs>,
  );

  const link = tab(screen, "Usuarios").element() as HTMLAnchorElement;
  expect(link.style.opacity).toBe("0.5");
  expect(ref.current).toBe(link);
});

test("passes the pointer and focus handlers a router preloads with to the tab's link", async () => {
  const onMouseEnter = vi.fn();
  const onFocus = vi.fn();
  const screen = await render(
    <Tabs
      label="Secciones de Personas"
      selectedTab="users"
      tabs={
        <>
          <Tab value="users" label="Usuarios" href="/people/users" />
          <Tab
            value="roles"
            label="Roles"
            href="/people/roles"
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
          />
        </>
      }
    >
      <p>Usuarios</p>
    </Tabs>,
  );

  await userEvent.hover(tab(screen, "Roles"));
  await userEvent.tab();
  await userEvent.keyboard("{ArrowRight}");

  expect(onMouseEnter).toHaveBeenCalled();
  expect(onFocus).toHaveBeenCalled();
});

test("ignores the current-page mark and the link role a router adds, keeping the tab's own role", async () => {
  const routerAttributes = { "aria-current": "page", role: "link" } as Record<string, string>;
  const screen = await render(
    <Tabs
      label="Secciones de Personas"
      selectedTab="users"
      tabs={<Tab value="users" label="Usuarios" href="/people/users" {...routerAttributes} />}
    >
      <p>Usuarios</p>
    </Tabs>,
  );

  const link = tab(screen, "Usuarios").element();
  expect(link.getAttribute("role")).toBe("tab");
  expect(link.hasAttribute("aria-current")).toBe(false);
});

test("scrolls a tab list wider than its space on one line, bringing the focused tab into view", async () => {
  const labels = [
    "Cajas",
    "Cierres de caja",
    "Movimientos de efectivo",
    "Devoluciones",
    "Reembolsos",
    "Comprobantes",
    "Listas de precios",
    "Comparar precios",
  ];
  const screen = await render(
    <div style={{ width: "320px" }}>
      <Tabs
        label="Secciones de Ventas y caja"
        selectedTab="tab-0"
        tabs={labels.map((label, index) => (
          <Tab key={label} value={`tab-${index}`} label={label} href={`/sales/${index}`} />
        ))}
      >
        <p>Cajas</p>
      </Tabs>
    </div>,
  );

  const list = screen.getByRole("tablist").element() as HTMLElement;
  const firstTop = tab(screen, "Cajas").element().getBoundingClientRect().top;
  const lastTab = tab(screen, "Comparar precios").element();
  expect(lastTab.getBoundingClientRect().top).toBe(firstTop);
  expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);

  await userEvent.tab();
  await userEvent.keyboard("{End}");

  await expect.element(lastTab).toHaveFocus();
  await expect
    .poll(() => lastTab.getBoundingClientRect().right)
    .toBeLessThanOrEqual(list.getBoundingClientRect().right + 0.5);
});

test("marks the selected tab with a bold accent label over an action-colored bar", async () => {
  const screen = await render(<PeopleTabs selectedTab="users" />);

  const selected = tab(screen, "Usuarios").element() as HTMLElement;
  expect(getComputedStyle(selected).borderBottomColor).toBe(tokenRgb("action"));
  expect(getComputedStyle(selected).borderBottomWidth).toBe("2px");
  const label = screen.getByText("Usuarios", { exact: true }).last().element();
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-accent"));
});

test("leaves an unselected tab with a regular label and no bar, turning bone on hover", async () => {
  const screen = await render(<PeopleTabs selectedTab="users" />);

  const unselected = tab(screen, "Roles").element() as HTMLElement;
  expect(getComputedStyle(unselected).borderBottomColor).toBe("rgba(0, 0, 0, 0)");
  const label = screen.getByText("Roles", { exact: true }).last().element();
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(getComputedStyle(label).color).toBe(tokenRgb("text"));

  await userEvent.hover(unselected);

  await expect
    .poll(() => getComputedStyle(unselected).backgroundColor)
    .toBe(tokenRgb("surface-subtle"));
});

test("keeps each tab's width when it turns selected", async () => {
  const screen = await render(<PeopleTabs selectedTab="users" />);
  await document.fonts.ready;
  const width = tab(screen, "Roles").element().getBoundingClientRect().width;

  await screen.rerender(<PeopleTabs selectedTab="roles" />);

  await expect.element(tab(screen, "Roles")).toHaveAttribute("aria-selected", "true");
  expect(tab(screen, "Roles").element().getBoundingClientRect().width).toBeCloseTo(width, 0);
});

test("dims a disabled tab", async () => {
  const screen = await render(<PeopleTabs disabledTab="roles" />);

  await expect.poll(() => getComputedStyle(tab(screen, "Roles").element()).opacity).not.toBe("1");
});

test("has no accessibility violations", async () => {
  const screen = await render(<PeopleTabs disabledTab="roles" />);

  await expectNoAccessibilityViolations(screen.container);
});
