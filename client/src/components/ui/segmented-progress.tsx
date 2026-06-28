"use client";

import { cn } from "@/lib/utils";

type SegmentedProgressProps = {
  completedValue: number;
  verifiedValue: number;
  className?: string;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function SegmentedProgress({
  completedValue,
  verifiedValue,
  className,
}: SegmentedProgressProps) {
  const completed = clampPercent(completedValue);
  const verified = clampPercent(Math.min(verifiedValue, completed));

  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/15",
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary/35 transition-all"
        style={{ width: `${completed}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
        style={{ width: `${verified}%` }}
      />
    </div>
  );
}
