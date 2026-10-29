import { changesPageSchema } from "@purosur/contracts";
import type {
  CloudChangeFeed,
  CloudChangeFeedAnswer,
  EntityChangeFeed,
  PulledEntity,
} from "@purosur/domain/sync/use-cases";
import type { CloudResponse } from "../platform/cloud-client";
import { type CloudFailure, failureOf } from "./cloud-failure";
import type { RegisterPulledChange } from "./pulled-change";

export type GetFromCloud = (
  path: string,
  headers: Record<string, string>,
) => Promise<CloudResponse>;

type Answer = CloudChangeFeedAnswer<RegisterPulledChange, CloudFailure>;

export class CloudPullFeed
  implements
    CloudChangeFeed<RegisterPulledChange, CloudFailure>,
    EntityChangeFeed<RegisterPulledChange, CloudFailure>
{
  private readonly get: GetFromCloud;
  private readonly deviceToken: string;
  private readonly appVersion: string | undefined;

  constructor(get: GetFromCloud, deviceToken: string, appVersion?: string) {
    this.get = get;
    this.deviceToken = deviceToken;
    this.appVersion = appVersion;
  }

  pageAfter(since: number): Promise<Answer> {
    return this.read(`/api/changes?since=${since}`);
  }

  pageOfEntityAfter(entity: PulledEntity, since: number): Promise<Answer> {
    return this.read(`/api/changes?since=${since}&entity=${entity}`);
  }

  private async read(path: string): Promise<Answer> {
    const response = await this.get(path, {
      authorization: `Bearer ${this.deviceToken}`,
      ...(this.appVersion === undefined ? {} : { "purosur-register-version": this.appVersion }),
    });
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const page = changesPageSchema.safeParse(response.body);
    if (!page.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    return {
      kind: "page",
      page: {
        changes: page.data.changes.map((change) => ({ changeSeq: change.change_seq, change })),
        cursor: page.data.cursor,
        hasMore: page.data.has_more,
      },
    };
  }
}
