import { expect, test } from "vitest";
import { accessWith } from "../shell/test-support/backoffice-access";
import { FISCAL_TAB_TARGETS, FISCAL_TABS } from "./fiscal-tabs";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return FISCAL_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

test("shows every tab to a person with every fiscal capability", () => {
  expect(
    visibleTabs("fiscal_information", "fiscal_configuration_area", "contingency_ticket_rescue"),
  ).toEqual(["tasks", "documents", "caea", "settings"]);
});

test("shows Tareas fiscales and Comprobantes with fiscal information, and CAEA y excepcionalidad for its exceptionality", () => {
  expect(visibleTabs("fiscal_information")).toEqual(["tasks", "documents", "caea"]);
});

test("shows CAEA y excepcionalidad and Configuración with fiscal configuration", () => {
  expect(visibleTabs("fiscal_configuration_area")).toEqual(["caea", "settings"]);
});

test("shows only CAEA y excepcionalidad with only the contingency ticket rescue", () => {
  expect(visibleTabs("contingency_ticket_rescue")).toEqual(["caea"]);
});

test("shows no tab without a fiscal capability", () => {
  expect(visibleTabs("reports_area")).toEqual([]);
});

test("gives each tab its own address", () => {
  expect(FISCAL_TAB_TARGETS).toEqual({
    tasks: "/fiscal",
    documents: "/fiscal/documents",
    caea: "/fiscal/caea",
    settings: "/fiscal/settings",
  });
});
