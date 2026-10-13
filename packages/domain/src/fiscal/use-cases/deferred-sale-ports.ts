export interface ShortCodeRandomness {
  nextIndex(bound: number): number;
}

export class ShortCodeTaken extends Error {}
