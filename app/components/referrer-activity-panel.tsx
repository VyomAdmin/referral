"use client";

import { useMemo, useState } from "react";
import { publicStages, StatusTimeline } from "./tracker";

type ReferredPerson = {
  id: string;
  customerFirstName: string;
  customerLastName: string;
  state: string;
  zip: string;
  status: string;
};

export function ReferrerActivityPanel({ referrals, totalCount }: { referrals: ReferredPerson[]; totalCount: number }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(referrals[0]?.id ?? null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return referrals;
    return referrals.filter((referral) => {
      const name = `${referral.customerFirstName} ${referral.customerLastName}`.toLowerCase();
      const stageLabel = (publicStages.find((stage) => stage.key === referral.status)?.label ?? referral.status).toLowerCase();
      return name.includes(needle) || stageLabel.includes(needle) || referral.status.toLowerCase().includes(needle);
    });
  }, [referrals, query]);

  const selected = referrals.find((referral) => referral.id === selectedId) ?? null;
  const selectedIndex = selected ? Math.max(publicStages.findIndex((stage) => stage.key === selected.status), 0) : 0;

  return (
    <div className="tracker-grid">
      <section className="tracker-list-card">
        <div className="card-heading">
          <div><span className="eyebrow">Referral activity</span><h2>People you referred</h2></div>
          <span className="status-pill status-pill-soft">{totalCount} total</span>
        </div>
        <label className="admin-search tracker-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or stage…" />
        </label>
        <div className="referral-list">
          {referrals.length === 0 ? (
            <p>Share your link to see referrals appear here.</p>
          ) : filtered.length === 0 ? (
            <p>No referrals match &quot;{query}&quot;.</p>
          ) : (
            filtered.map((referral) => (
              <button
                key={referral.id}
                type="button"
                className={`referral-row-clickable${referral.id === selectedId ? " referral-row-selected" : ""}`}
                onClick={() => setSelectedId(referral.id)}
              >
                <div className="avatar-circle">{referral.customerFirstName.slice(0, 1)}</div>
                <div className="referral-person"><strong>{referral.customerFirstName} {referral.customerLastName.slice(0, 1)}.</strong><small>{referral.state} • {referral.zip}</small></div>
                <span className={`referral-status referral-${referral.status}`}>{publicStages.find((stage) => stage.key === referral.status)?.label ?? referral.status}</span>
              </button>
            ))
          )}
        </div>
      </section>
      <aside className="tracker-status-card">
        <span className="eyebrow">{selected ? "Referral detail" : "Latest activity"}</span>
        <h2>{selected ? `${selected.customerFirstName}'s progress` : "No activity yet"}</h2>
        <p>Only privacy-safe status details are shown.</p>
        {selected ? <StatusTimeline activeIndex={selectedIndex} /> : null}
      </aside>
    </div>
  );
}
