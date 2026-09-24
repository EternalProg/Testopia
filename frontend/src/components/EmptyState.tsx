export function EmptyState({
  title,
  text,
  role,
}: {
  title?: string;
  text: string;
  role?: 'status';
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-line-dark bg-card px-7 py-9 text-center text-muted">
      {title && <h2 className="mb-2 text-[1.15rem] font-bold text-ink">{title}</h2>}
      <p role={role} className="mb-0">
        {text}
      </p>
    </div>
  );
}
