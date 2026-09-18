import { useEffect, useState } from "react";

// Shared by the whole notice family: an error notice must interrupt current speech (role="alert",
// implicitly aria-live="assertive"), every other tone waits for it to end (role="status",
// implicitly aria-live="polite").
export type NoticeAssertiveness = "assertive" | "polite";

// A live region that already carries its full text on the very same paint it is inserted with is
// announced unreliably by several screen readers (documented for @reach/alert's Alert component,
// which this follows): some only start watching a region for mutations once it exists in the
// accessibility tree, so a region that arrives pre-populated is never "changed" from their point
// of view. Mounting the region empty and filling it a tick later, from an effect that runs after
// the first commit, turns the announcement into a genuine mutation of an already-present region.
// It renders visually hidden and duplicates the notice's own visible text, so sighted users see
// the title and detail immediately with no flash, while assistive technology gets the reliable
// two-step mutation.
export function NoticeLiveRegion({
  assertiveness,
  text,
}: {
  assertiveness: NoticeAssertiveness;
  text: string;
}) {
  const [announced, setAnnounced] = useState<string>();

  useEffect(() => {
    setAnnounced(text);
  }, [text]);

  return (
    <span className="sr-only" role={assertiveness === "assertive" ? "alert" : "status"}>
      {announced}
    </span>
  );
}
