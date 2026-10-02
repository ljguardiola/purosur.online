import { type Icon, iconSlotClassName } from "../shared/icon";

export type ElevatedNoticeProps = {
  notice?: { icon: Icon; title: string; description: string } | undefined;
};

// The region stays mounted while empty: one that arrives already holding its text is not
// announced.
export function ElevatedNotice({ notice }: ElevatedNoticeProps) {
  return (
    <div role="status">
      {notice === undefined ? null : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-6 text-center shadow-lg">
          <span aria-hidden="true" className={`${iconSlotClassName["3xl"]} text-text-subtle`}>
            {notice.icon}
          </span>
          <p className="text-heading text-text">{notice.title}</p>
          <p className="text-body text-text-subtle">{notice.description}</p>
        </div>
      )}
    </div>
  );
}
