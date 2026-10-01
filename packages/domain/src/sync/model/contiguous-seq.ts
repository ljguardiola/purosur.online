export function highestContiguousSeq(seqs: readonly number[]): number {
  const held = new Set(seqs);
  let highest = 0;
  while (held.has(highest + 1)) {
    highest += 1;
  }
  return highest;
}
