import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";

describe("the register's renderer under its content security policy", () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    app = (await launchApp()).app;
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await app.close();
  });

  it("raises no violation while it starts and a control is pressed", async () => {
    await page.addInitScript(() => {
      const violations: string[] = [];
      Object.assign(window, { contentSecurityPolicyViolations: violations });
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(
          `${event.effectiveDirective} blocked ${event.blockedURI} in ${event.sourceFile}`,
        );
      });
    });
    // The window has already started the app by the time the test gets it; a reload starts it
    // again with the listener in place.
    await page.reload();

    await page.getByRole("button", { name: "Dar de alta" }).click();

    const violations = await page.evaluate(() =>
      "contentSecurityPolicyViolations" in window ? window.contentSecurityPolicyViolations : null,
    );
    expect(violations).toEqual([]);
  });
});
