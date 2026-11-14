import type { RegisterAbility } from "@purosur/domain";

export type SettingsSection = "printer" | "devices";

const ABILITY_OF_SECTION = {
  printer: "configure_receipt_printer",
  devices: "configure_serial_devices",
} as const satisfies Record<SettingsSection, RegisterAbility>;

const SECTIONS_IN_ORDER = ["printer", "devices"] as const satisfies readonly SettingsSection[];

export function shownSections(abilities: readonly RegisterAbility[]): SettingsSection[] {
  return SECTIONS_IN_ORDER.filter((section) => abilities.includes(ABILITY_OF_SECTION[section]));
}

export function sectionToShow(
  shown: readonly SettingsSection[],
  asked: SettingsSection | undefined,
): SettingsSection | undefined {
  return asked !== undefined && shown.includes(asked) ? asked : shown[0];
}

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SECTIONS_IN_ORDER.some((section) => section === value);
}
