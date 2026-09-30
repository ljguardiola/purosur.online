import { House } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import type { ActionEntry } from "./action-entries";
import { entriesFor } from "./action-entries";

function entry(label: string, permission: ActionEntry["permission"]): ActionEntry {
  return { label, icon: House, permission, opens: vi.fn() };
}

const HISTORY = entry("Historial", "view_sales_history");
const REPRINT = entry("Reimprimir", "reprint_receipt");
const HELP = entry("Ayuda", "sell_and_charge");

describe("entriesFor", () => {
  it("keeps only the entries whose permission the person holds", () => {
    expect(entriesFor([HISTORY, REPRINT, HELP], ["reprint_receipt"])).toEqual([REPRINT]);
  });

  it("keeps the registry order", () => {
    expect(entriesFor([HISTORY, REPRINT, HELP], ["sell_and_charge", "view_sales_history"])).toEqual(
      [HISTORY, HELP],
    );
  });

  it("offers nothing to a person who holds none of the permissions", () => {
    expect(entriesFor([HISTORY, REPRINT], [])).toEqual([]);
  });

  it("offers nothing when there are no entries", () => {
    expect(entriesFor([], ["sell_and_charge"])).toEqual([]);
  });
});
