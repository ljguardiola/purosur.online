import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ScreenLayout } from "./ScreenLayout";

function renderLayout() {
  return render(
    <div style={{ height: "300px" }} className="flex flex-col overflow-hidden">
      <ScreenLayout
        topBar={<div>Top bar</div>}
        bodyClassName="gap-2 p-4"
        footer={<div>Footer</div>}
      >
        {Array.from({ length: 60 }, (_, index) => `Line ${index}`).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </ScreenLayout>
    </div>,
  );
}

test("renders the top bar, then the body, then the footer, in DOM order", async () => {
  const screen = await renderLayout();

  const texts = Array.from(screen.container.querySelectorAll("div, p")).map(
    (element) => element.textContent,
  );
  const topBarIndex = texts.indexOf("Top bar");
  const firstLineIndex = texts.indexOf("Line 0");
  const footerIndex = texts.indexOf("Footer");

  expect(topBarIndex).toBeGreaterThanOrEqual(0);
  expect(topBarIndex).toBeLessThan(firstLineIndex);
  expect(firstLineIndex).toBeLessThan(footerIndex);
});

test("scrolling the body leaves the top bar's position unchanged and keeps the footer visible", async () => {
  const screen = await renderLayout();

  const topBar = screen.getByText("Top bar").element();
  const body = topBar.nextElementSibling as HTMLElement;
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);

  const topBarTopBefore = topBar.getBoundingClientRect().top;
  body.scrollTop = body.scrollHeight;
  await expect.element(screen.getByText("Line 59")).toBeVisible();

  expect(topBar.getBoundingClientRect().top).toBe(topBarTopBefore);
  await expect.element(screen.getByText("Footer")).toBeVisible();
});
