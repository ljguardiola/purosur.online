import {
  type LocalSnapshotGeneration,
  pendingSnapshotGenerationsNewestFirst,
} from "../../model/local-snapshot-generation.js";
import type {
  LocalSnapshotGenerations,
  SnapshotCloudStep,
  SnapshotDeclarationAnswer,
  SnapshotUploadCloud,
} from "../snapshot-upload-ports.js";

export type SnapshotUploadEvent =
  | { kind: "declare"; generationId: string }
  | { kind: "put"; authorization: string; object: string }
  | { kind: "confirm"; generationId: string }
  | { kind: "mark_uploaded"; generationId: string; at: Date }
  | { kind: "mark_refused"; generationId: string; at: Date };

export class FakeLocalSnapshotGenerations implements LocalSnapshotGenerations {
  generations: LocalSnapshotGeneration[] = [];
  readonly objects = new Map<string, Uint8Array<ArrayBuffer>>();

  private readonly events: SnapshotUploadEvent[];

  constructor(events: SnapshotUploadEvent[]) {
    this.events = events;
  }

  hold(generation: LocalSnapshotGeneration, object: string | null = generation.generationId) {
    this.generations.push(generation);
    if (object !== null) {
      this.objects.set(generation.generationId, new TextEncoder().encode(object));
    }
  }

  find(generationId: string): LocalSnapshotGeneration | undefined {
    return this.generations.find((entry) => entry.generationId === generationId);
  }

  async pendingNewestFirst(): Promise<LocalSnapshotGeneration[]> {
    return pendingSnapshotGenerationsNewestFirst(this.generations);
  }

  async objectOf(
    generation: LocalSnapshotGeneration,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return this.objects.get(generation.generationId);
  }

  async markUploaded(generation: LocalSnapshotGeneration, at: Date): Promise<void> {
    this.events.push({ kind: "mark_uploaded", generationId: generation.generationId, at });
    this.replace({ ...generation, uploadedAt: at });
  }

  async markRefused(generation: LocalSnapshotGeneration, at: Date): Promise<void> {
    this.events.push({ kind: "mark_refused", generationId: generation.generationId, at });
    this.replace({ ...generation, refusedAt: at });
  }

  private replace(generation: LocalSnapshotGeneration): void {
    this.generations = this.generations.map((entry) =>
      entry.generationId === generation.generationId ? generation : entry,
    );
  }
}

export class FakeSnapshotUploadCloud implements SnapshotUploadCloud<string> {
  onDeclare: (generation: LocalSnapshotGeneration) => SnapshotDeclarationAnswer<string> = (
    generation,
  ) => ({ kind: "accepted", authorization: `upload of ${generation.generationId}` });
  onPut: (authorization: string) => SnapshotCloudStep = () => "done";
  onConfirm: (generation: LocalSnapshotGeneration) => SnapshotCloudStep = () => "done";

  private readonly events: SnapshotUploadEvent[];

  constructor(events: SnapshotUploadEvent[]) {
    this.events = events;
  }

  async declare(generation: LocalSnapshotGeneration): Promise<SnapshotDeclarationAnswer<string>> {
    this.events.push({ kind: "declare", generationId: generation.generationId });
    return this.onDeclare(generation);
  }

  async putObject(
    authorization: string,
    object: Uint8Array<ArrayBuffer>,
  ): Promise<SnapshotCloudStep> {
    this.events.push({ kind: "put", authorization, object: new TextDecoder().decode(object) });
    return this.onPut(authorization);
  }

  async confirmUploaded(generation: LocalSnapshotGeneration): Promise<SnapshotCloudStep> {
    this.events.push({ kind: "confirm", generationId: generation.generationId });
    return this.onConfirm(generation);
  }
}
