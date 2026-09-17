export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return (
    <p role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
