const R = 44;
const C = 2 * Math.PI * R;

/**
 * Win-rate ring. pct === null means nothing has closed yet in this group —
 * shown as an empty ring with a dash rather than a misleading 0%.
 */
export default function Ring({ pct, target, state, label, closed }) {
  const offset = pct === null ? C : C * (1 - pct / 100);

  return (
    <div className="ring-cell" data-state={state}>
      <div className="ring">
        <svg viewBox="0 0 108 108" aria-hidden="true">
          <circle className="ring-track" cx="54" cy="54" r={R} fill="none" strokeWidth="9" />
          <circle
            className="ring-fill"
            cx="54"
            cy="54"
            r={R}
            fill="none"
            strokeWidth="9"
            strokeDasharray={C.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
          />
        </svg>
        <div className="ring-mid">
          <span className="num pct">{pct === null ? '—' : `${pct}%`}</span>
          <span className="tgt">TGT {target}%</span>
        </div>
      </div>
      <div className="ring-label" style={{ textTransform: 'capitalize' }}>
        {label}
      </div>
      <div className="ring-note">
        {closed === 0 ? 'nothing closed yet' : `${closed} closed`}
      </div>
    </div>
  );
}
