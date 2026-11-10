import { useState } from "react";
import { SegmentedControl, type SegmentedControlProps } from "./segmented-control";
import { Select } from "./select";

export type CollapsibleSegmentedControlProps<V extends string> = SegmentedControlProps<V> & {
  name: string;
};

export function CollapsibleSegmentedControl<V extends string>({
  name,
  label,
  options,
  value,
  onChange,
  size = "medium",
}: CollapsibleSegmentedControlProps<V>) {
  const [fits, setFits] = useState(true);

  function observeFit(area: HTMLDivElement | null) {
    const natural = area?.firstElementChild;
    if (area === null || area === undefined || !(natural instanceof HTMLElement)) {
      return;
    }
    const measure = () => setFits(natural.offsetWidth <= area.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(natural);
    return () => observer.disconnect();
  }

  return (
    <div ref={observeFit} className="relative overflow-hidden">
      <div aria-hidden="true" inert className="invisible absolute top-0 left-0 w-max">
        <SegmentedControl<V>
          label={label}
          options={options}
          value={value}
          onChange={() => {}}
          size={size}
        />
      </div>
      {fits ? (
        <SegmentedControl<V>
          label={label}
          options={options}
          value={value}
          onChange={onChange}
          size={size}
        />
      ) : (
        <div className="max-w-80">
          <Select<V>
            name={name}
            label={label}
            options={options}
            value={value}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}
