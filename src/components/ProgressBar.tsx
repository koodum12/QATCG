/** 잡 진행 상태 바. stage 라벨 + 퍼센트 표시 */
export function ProgressBar({
  stage,
  progress,
  error,
}: {
  stage: string;
  progress: number;
  error?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{stage}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full transition-all duration-300 ${error ? 'bg-red-500' : 'bg-blue-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
