import { useTooltipPosition } from "./tooltip-position";
export type TrackTooltip = {
  interval: string;
  label: string;
  value?: string;
  tone: "price" | "power" | "soc" | "contribution";
  rows?: { label: string; value: string }[];
};
/** A single structured renderer; placement flips only when the plot edge requires it. */
export function TrackReadout({ value }: { value?: TrackTooltip }) {
  const { fraction, width } = useTooltipPosition();
  const size = Math.min(236, Math.max(0, width - 16));
  const anchor = fraction * width;
  const left = Math.max(
    8,
    Math.min(width - size - 8, anchor + 18 + size <= width - 8 ? anchor + 18 : anchor - size - 18),
  );
  return value ? (
    <div
      className={`schedule-track-readout ${value.tone}`}
      role="tooltip"
      style={{
        left,
      }}
    >
      <div className="tooltip-interval">{value.interval}</div>
      <span className="tooltip-label">{value.label}</span>
      {value.value && <strong className="tooltip-value">{value.value}</strong>}
      {value.rows && (
        <dl>
          {value.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  ) : null;
}
