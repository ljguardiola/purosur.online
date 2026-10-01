import { House } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { ActionEntry } from "./action-entries";
import { entriesFor } from "./action-entries";

function entry(label: string, ability: ActionEntry["ability"]): ActionEntry {
  return { label, icon: House, ability, to: "/sign-in" };
}

const HISTORY = entry("Historial", "view_sales_history");
const REPRINT = entry("Reimprimir", "reprint_receipt");
const HELP = entry("Reloj", "correct_register_clock");

describe("entriesFor", () => {
  it("keeps only the entries whose ability the person has", () => {
    expect(entriesFor([HISTORY, REPRINT, HELP], ["reprint_receipt"])).toEqual([REPRINT]);
  });

  it("keeps the registry order", () => {
    expect(
      entriesFor([HISTORY, REPRINT, HELP], ["correct_register_clock", "view_sales_history"]),
    ).toEqual([HISTORY, HELP]);
  });

  it("offers nothing to a person who has none of the abilities", () => {
    expect(entriesFor([HISTORY, REPRINT], [])).toEqual([]);
  });

  it("offers nothing when there are no entries", () => {
    expect(entriesFor([], ["correct_register_clock"])).toEqual([]);
  });
});
