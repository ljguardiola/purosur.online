import type {} from "@vitest/browser-playwright";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { cdp } from "vitest/browser";
import { LazyProductRecipeLookup } from "./lazy-product-recipe-lookup";
import { ScreenDownloadFailure } from "./lazy-screen";
import { render } from "./test-support/render-with-router";

class CaughtError extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? <p>Falló</p> : this.props.children;
  }
}

beforeEach(async () => {
  window.sessionStorage.clear();
  const session = cdp();
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", {
    urls: ["*/src/stock/product-recipe-lookup.tsx*"],
  });
});

afterEach(async () => {
  await cdp().send("Network.setBlockedURLs", { urls: [] });
  window.sessionStorage.clear();
});

test("fails as a screen download failure when the lookup's code cannot download", async () => {
  const caught: unknown[] = [];

  const screen = await render(
    <CaughtError onError={(error) => caught.push(error)}>
      <LazyProductRecipeLookup productId="product-1" enabled={false} onSessionEnded={() => {}}>
        {(lookup) => <p>{`Receta: ${lookup}`}</p>}
      </LazyProductRecipeLookup>
    </CaughtError>,
  );

  await expect.element(screen.getByText("Falló")).toBeVisible();
  expect(caught).toEqual([expect.any(ScreenDownloadFailure)]);
});
