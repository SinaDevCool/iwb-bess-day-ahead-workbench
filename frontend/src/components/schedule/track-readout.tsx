/** A synchronized, non-interactive overlay: changing values never moves a plot. */
export function TrackReadout({ value }: { value?: string }) {
  return value ? (
    <div className="schedule-track-readout" role="tooltip">
      {value}
    </div>
  ) : null;
}
