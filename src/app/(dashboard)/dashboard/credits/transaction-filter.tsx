"use client";

import { useState } from "react";

type Filter = "all" | "plus" | "minus";

export interface CreditTxRow {
  id: string;
  createdAt: string; // pre-formatted (server → client serializable)
  kindLabel: string;
  kindChipClass: string;
  amount: number; // signed
  balanceAfter: number;
  description: string;
  submeta: string | null;
}

interface Props {
  rows: CreditTxRow[];
  labels: {
    colDate: string;
    colKind: string;
    colDesc: string;
    colAmount: string;
    colBalance: string;
    empty: string;
  };
}

export default function TransactionFilter({ rows, labels }: Props) {
  const [f, setF] = useState<Filter>("all");

  const plusCount = rows.filter((r) => r.amount >= 0).length;
  const minusCount = rows.length - plusCount;

  const matched = rows.filter((r) => {
    if (f === "all") return true;
    if (f === "plus") return r.amount >= 0;
    return r.amount < 0;
  });

  return (
    <>
      <div className="cr2-use-head">
        <h3>
          <svg width={14} height={14} style={{ color: "var(--ai)" }}>
            <use href="#i-hash" />
          </svg>
          거래 내역
        </h3>
        <div className="cr2-filter">
          <button type="button" className={f === "all" ? "on" : ""} onClick={() => setF("all")}>
            전체 <span style={{ opacity: 0.6 }}>{rows.length}</span>
          </button>
          <button type="button" className={f === "plus" ? "on" : ""} onClick={() => setF("plus")}>
            충전 <span style={{ opacity: 0.6 }}>{plusCount}</span>
          </button>
          <button type="button" className={f === "minus" ? "on" : ""} onClick={() => setF("minus")}>
            사용 <span style={{ opacity: 0.6 }}>{minusCount}</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="cr2-use-empty">
          <div className="ic">
            <svg width={28} height={28}><use href="#i-hash" /></svg>
          </div>
          <div className="t">{labels.empty}</div>
          <div className="s">AI 기능을 사용하거나 크레딧을 충전하면 이곳에 표시됩니다.</div>
        </div>
      ) : matched.length === 0 ? (
        <div className="cr2-use-empty">
          <div className="ic">
            <svg width={28} height={28}><use href="#i-hash" /></svg>
          </div>
          <div className="t">해당 유형의 내역이 없습니다</div>
          <div className="s">필터를 바꿔 전체 내역을 확인해보세요.</div>
        </div>
      ) : (
        <table className="cr2-tbl">
          <thead>
            <tr>
              <th style={{ width: 170 }}>{labels.colDate}</th>
              <th style={{ width: 120 }}>{labels.colKind}</th>
              <th>{labels.colDesc}</th>
              <th className="right" style={{ width: 120 }}>{labels.colAmount}</th>
              <th className="right" style={{ width: 100 }}>{labels.colBalance}</th>
            </tr>
          </thead>
          <tbody>
            {matched.map((row) => {
              const isPlus = row.amount >= 0;
              return (
                <tr key={row.id}>
                  <td>
                    <span className="date">{row.createdAt}</span>
                  </td>
                  <td>
                    <span className={row.kindChipClass}>{row.kindLabel}</span>
                  </td>
                  <td>
                    <div className="desc-main">{row.description}</div>
                    {row.submeta && <div className="desc-sub">{row.submeta}</div>}
                  </td>
                  <td className={`delta ${isPlus ? "plus" : "minus"}`}>
                    {isPlus ? "+" : "−"}
                    {Math.abs(row.amount).toLocaleString()}
                  </td>
                  <td className="bal-cell">{row.balanceAfter.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
