import type { ListedOwedPresentation } from "../model/owed-presentation-list.js";

export interface OwedPresentationList {
  listed(): Promise<ListedOwedPresentation[]>;
  replace(list: ListedOwedPresentation[], at: Date): Promise<void>;
  resolve(key: ListedOwedPresentation, at: Date): Promise<void>;
}
