import { useTooltipPosition } from "./tooltip-position";
/** Shared-position overlays stay inside their plots and never affect layout. */
export function TrackReadout({ value }: { value?: string }) {
  const fraction = useTooltipPosition();
  const [interval, ...values] = value?.split(" · ") ?? [];
  return value ? (
    <div
      className="schedule-track-readout"
      role="tooltip"
      style={{
        left: `clamp(8px, calc(${fraction * 100}% + ${fraction > 0.55 ? -252 : 18}px), calc(100% - 244px))`,
      }}
    >
      <strong>{interval}</strong>
      {values.map((line, index) => (
        <span key={index}>{line}</span>
      ))}
    </div>
  ) : null;
}
