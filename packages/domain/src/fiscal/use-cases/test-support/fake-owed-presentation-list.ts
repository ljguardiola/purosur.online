import {
  type ListedOwedPresentation,
  listsOwedPresentation,
  splitOwedPresentations,
} from "../../model/owed-presentation-list.js";
import type { OwedPresentationList } from "../owed-presentation-list-ports.js";

export class FakeOwedPresentationList implements OwedPresentationList {
  entries: ListedOwedPresentation[] = [];
  failingReplace = false;
  readonly replacements: { list: ListedOwedPresentation[]; at: Date }[] = [];
  readonly resolutions: ListedOwedPresentation[] = [];

  async listed(): Promise<ListedOwedPresentation[]> {
    return structuredClone(this.entries);
  }

  async replace(list: ListedOwedPresentation[], at: Date): Promise<void> {
    if (this.failingReplace) {
      throw new Error("replace failed");
    }
    this.replacements.push({ list: structuredClone(list), at: new Date(at) });
    this.entries = structuredClone(list);
  }

  async resolve(key: ListedOwedPresentation): Promise<void> {
    this.resolutions.push(structuredClone(key));
    this.entries = this.entries.filter((entry) => !listsOwedPresentation([entry], key));
  }

  async clearOwedElsewhere(ownedPointsOfSale: readonly number[]): Promise<void> {
    this.entries = splitOwedPresentations(this.entries, ownedPointsOfSale).owned;
  }
}
