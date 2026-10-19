import {
  type ListedOwedPresentation,
  listsOwedPresentation,
} from "../../model/owed-presentation-list.js";
import type { OwedPresentationList } from "../owed-presentation-list-ports.js";

export class FakeOwedPresentationList implements OwedPresentationList {
  entries: ListedOwedPresentation[] = [];
  readonly replacements: { list: ListedOwedPresentation[]; at: Date }[] = [];
  readonly resolutions: { key: ListedOwedPresentation; at: Date }[] = [];

  async listed(): Promise<ListedOwedPresentation[]> {
    return structuredClone(this.entries);
  }

  async replace(list: ListedOwedPresentation[], at: Date): Promise<void> {
    this.replacements.push({ list: structuredClone(list), at: new Date(at) });
    this.entries = structuredClone(list);
  }

  async resolve(key: ListedOwedPresentation, at: Date): Promise<void> {
    this.resolutions.push({ key: structuredClone(key), at: new Date(at) });
    this.entries = this.entries.filter((entry) => !listsOwedPresentation([entry], key));
  }
}
