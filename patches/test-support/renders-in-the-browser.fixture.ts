import { expect, test } from "vitest";

test("renders in the browser", () => {
  expect(document.body).toBeInstanceOf(HTMLElement);
});
