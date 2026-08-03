import React from "react";

/**
 * Segmented bottom progress bar — "Question i/N". Completed segments are
 * fully filled, the active segment fills continuously with `segmentProgress`.
 * Pure render (parent supplies all animation inputs), so it can float above
 * Series sequences without remounting.
 */
export interface ProgressBarProps {
  /** 1-based index of the active segment. */
  current: number;
  total: number;
  /** 0..1 fill of the active segment. */
  segmentProgress: number;
  accentColor?: string;
  labelPrefix?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  segmentProgress,
  accentColor = "#8b5cf6",
  labelPrefix = "Question",
}) => {
  const segments = new Array(total).fill(0).map((_, idx) => {
    if (idx < current - 1) return 1;
    if (idx === current - 1) return Math.min(1, Math.max(0, segmentProgress));
    return 0;
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
        bottom: 110,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span
          style={{
            fontFamily: '"Segoe UI", Roboto, sans-serif',
            fontWeight: 700,
            fontSize: 30,
            color: "rgba(255,255,255,0.92)",
            background: "rgba(10, 4, 24, 0.6)",
            border: "2px solid rgba(255,255,255,0.16)",
            borderRadius: 999,
            padding: "8px 26px",
            letterSpacing: 1,
          }}
        >
          {labelPrefix} {current}/{total}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {segments.map((fill, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              height: 12,
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${fill * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${accentColor}, #e9d5ff)`,
                boxShadow: fill > 0 ? `0 0 12px ${accentColor}` : "none",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
