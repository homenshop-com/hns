"use client";

import { useState } from "react";

type Filter = "all" | "plus" | "minus";

interface RowData {
  id: string;
  sign: "plus" | "minus";
}

/**
 * Client-side filter for the transaction table. Takes the raw rows as
 * props, renders the <thead>/<tbody> inline (so the table keeps its
 * sticky-like styling from the parent card), and updates a `hidden` set
 * in state.
 *
 * The visible row DOM is passed via `children` — this component only
 * manages the filter UI and the counts. Because hiding rows cleanly
 * requires a structural filter, we render an empty-state row through
 * `renderEmpty` when no rows match.
 */
export default function TransactionFilter({
  rows,
  counts,
  children,
}: {
  rows: RowData[];
  counts: { all: number; plus: number; minus: number };
  children: (hidden: Set<string>, matched: number) => React.ReactNode;
}) {
  const [f, setF] = useState<Filter>("all");

  const hidden = new Set<string>();
  let matched = 0;
  for (const r of rows) {
    if (f === "all" || r.sign === f) matched += 1;
    else hidden.add(r.id);
  }

  return (
    <>
      <div className="cr2-filter">
        <button
          type="button"
          className={f === "all" ? "on" : ""}
          onClick={() => setF("all")}
        >
          전체 <span style={{ opacity: 0.6 }}>{counts.all}</span>
        </button>
        <button
          type="button"
          className={f === "plus" ? "on" : ""}
          onClick={() => setF("plus")}
        >
          충전 <span style={{ opacity: 0.6 }}>{counts.plus}</span>
        </button>
        <button
          type="button"
          className={f === "minus" ? "on" : ""}
          onClick={() => setF("minus")}
        >
          사용 <span style={{ opacity: 0.6 }}>{counts.minus}</span>
        </button>
      </div>
      {children(hidden, matched)}
    </>
  );
}
