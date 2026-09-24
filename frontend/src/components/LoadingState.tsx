export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return (
    <p role="status" className="text-muted">
      <span
        aria-hidden="true"
        className="mr-2 inline-block h-4 w-4 -translate-y-[1px] rounded-full border-2 border-line-dark align-middle [animation:spin_0.8s_linear_infinite] [border-top-color:var(--color-ink)]"
      />
      {text}
    </p>
  );
}
