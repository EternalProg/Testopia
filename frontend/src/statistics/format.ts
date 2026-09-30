export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return '—';
  if (totalSeconds < 60) return `${totalSeconds} с`;
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} хв` : `${minutes} хв ${seconds} с`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes === 0 ? `${hours} год` : `${hours} год ${minutes} хв`;
}
