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
    <div className="empty-state">
      {title && <h2>{title}</h2>}
      <p role={role}>{text}</p>
    </div>
  );
}
