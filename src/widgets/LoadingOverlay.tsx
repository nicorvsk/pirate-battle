export function LoadingOverlay({ label, progress }: { label: string; progress?: number }) {
  return (
    <div className="overlay" role="status">
      <p>
        {label}
        {progress === undefined ? '…' : `… ${Math.round(progress * 100)}%`}
      </p>
      {progress !== undefined && <progress max={1} value={progress} aria-label="Asset loading progress" />}
    </div>
  );
}
