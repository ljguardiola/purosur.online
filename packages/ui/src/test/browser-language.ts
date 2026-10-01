import { onTestFinished } from "vitest";

// React Aria reads the browser's language once when it loads and again only on a
// `languagechange` event that a still-mounted component hears, so this switches it after rendering.
export function switchBrowserLanguage(language: string): void {
  Object.defineProperty(navigator, "language", { value: language, configurable: true });
  window.dispatchEvent(new Event("languagechange"));
  onTestFinished(() => {
    Reflect.deleteProperty(navigator, "language");
    window.dispatchEvent(new Event("languagechange"));
  });
}
