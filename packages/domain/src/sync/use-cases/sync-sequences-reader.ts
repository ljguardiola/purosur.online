export interface SyncSequences {
  lastDeviceSeq: number;
  pullCursor: number;
}

export interface SyncSequencesReader {
  current(): Promise<SyncSequences>;
}
