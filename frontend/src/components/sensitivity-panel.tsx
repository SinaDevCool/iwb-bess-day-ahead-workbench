"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SensitivityCase, SensitivityItem } from "@/types/api";

const MAX_SELECTED = 5;

const money = (value: number) => new Intl.NumberFormat("en-CH", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0, signDisplay: "always",
}).format(value);
const number = (value: number) => new Intl.NumberFormat("en-CH", {
  maximumFractionDigits: 2,
}).format(value);

function recommended(items: SensitivityItem[]) {
  const preferred = items.filter((item) => item.default_selected !== false).slice(0, MAX_SELECTED);
  return (preferred.length ? preferred : items.slice(0, MAX_SELECTED)).map((item) => item.key);
}

function caseText(label: string, item: SensitivityItem, test?: SensitivityCase | null) {
  if (!test) return null;
  return `${label} ${number(test.value)} ${test.unit}: ${money(test.delta_eur)}`;
}

export function SensitivityPanel({ items }: { items: SensitivityItem[] }) {
  const [selected, setSelected] = useState<string[]>(() => {
    if (typeof window === "undefined") return recommended(items);
    const saved = sessionStorage.getItem("iwb-sensitivity-levers");
    if (!saved) return recommended(items);
    try {
      const parsed = JSON.parse(saved) as string[];
      const valid = parsed.filter((key) => items.some((item) => item.key === key)).slice(0, MAX_SELECTED);
      return valid.length ? valid : recommended(items);
    } catch { /* Ignore obsolete browser state. */ }
    return recommended(items);
  });
  useEffect(() => {
    sessionStorage.setItem("iwb-sensitivity-levers", JSON.stringify(selected));
  }, [selected]);

  const visible = useMemo(
    () => items.filter((item) => selected.includes(item.key)).sort((a, b) =>
      selected.indexOf(a.key) - selected.indexOf(b.key)),
    [items, selected],
  );
  const scale = Math.max(1, ...visible.flatMap((item) => [
    Math.abs(item.lower_case?.delta_eur ?? item.contribution_delta_eur),
    Math.abs(item.upper_case?.delta_eur ?? 0),
  ]));

  const toggle = (key: string) => setSelected((current) => {
    if (current.includes(key)) return current.filter((item) => item !== key);
    return current.length < MAX_SELECTED ? [...current, key] : current;
  });

  return (
    <section className="value-drivers" aria-labelledby="value-drivers-title">
      <div className="value-drivers-head">
        <div>
          <span className="eyebrow">DECISION SUPPORT</span>
          <h3 id="value-drivers-title">Decision Sensitivity</h3>
          <p>Estimated effect of feasible operating changes using this completed run.</p>
        </div>
        <details className="column-picker sensitivity-picker">
          <summary aria-label="Choose sensitivity parameters">
            <SlidersHorizontal size={15} aria-hidden="true" />
            Levers · {selected.length}/{MAX_SELECTED}
          </summary>
          <div className="column-menu">
            <strong>Sensitivity levers</strong>
            <span>Show up to 5. Changing this view does not rerun the optimization.</span>
            {(["operational", "strategy"] as const).map((category) => {
              const categoryItems = items.filter((item) => (item.category ?? "operational") === category);
              if (!categoryItems.length) return null;
              return <div className="sensitivity-options" key={category}>
                <small>{category === "operational" ? "OPERATIONAL" : "STRATEGY & VALUATION"}</small>
                {categoryItems.map((item) => {
                  const checked = selected.includes(item.key);
                  return <label className="column-option" key={item.key} title={item.interpretation}>
                    <input type="checkbox" checked={checked} disabled={!checked && selected.length >= MAX_SELECTED}
                      onChange={() => toggle(item.key)} />
                    <span>{item.label}</span>
                  </label>;
                })}
              </div>;
            })}
            <button className="sensitivity-reset" type="button" onClick={() => setSelected(recommended(items))}>
              Restore Recommended
            </button>
          </div>
        </details>
      </div>
      {visible.length ? <div className="value-driver-list" role="list" aria-label="Contribution sensitivity by decision lever">
        {visible.map((item) => {
          const cases = [item.lower_case, item.upper_case].filter(Boolean) as SensitivityCase[];
          const accessible = [caseText("Lower test", item, item.lower_case), caseText("Upper test", item, item.upper_case)].filter(Boolean).join("; ");
          return <div className="value-driver" role="listitem" key={item.key} title={item.interpretation}>
            <div className="value-driver-label">
              <strong>{item.label}</strong>
              <small>Baseline {number(item.baseline_value)} {item.unit}</small>
            </div>
            <div className="sensitivity-plot" aria-label={`${item.label}. ${accessible}`}>
              <span className="sensitivity-zero" aria-hidden="true" />
              {cases.map((test, index) => {
                const width = Math.max(2, Math.abs(test.delta_eur) / scale * 50);
                return <i key={`${test.value}-${index}`} className={test.delta_eur >= 0 ? "gain" : "loss"}
                  style={test.delta_eur >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} aria-hidden="true" />;
              })}
            </div>
            <div className="value-driver-cases">
              {item.lower_case && <small><span>Test {number(item.lower_case.value)} {item.unit}</span><b className={item.lower_case.delta_eur >= 0 ? "positive" : "negative"}>{money(item.lower_case.delta_eur)}</b></small>}
              {item.upper_case && <small><span>Test {number(item.upper_case.value)} {item.unit}</span><b className={item.upper_case.delta_eur >= 0 ? "positive" : "negative"}>{money(item.upper_case.delta_eur)}</b></small>}
              {!item.lower_case && !item.upper_case && <b className={item.contribution_delta_eur >= 0 ? "positive" : "negative"}>{money(item.contribution_delta_eur)}</b>}
            </div>
          </div>;
        })}
      </div> : <p className="sensitivity-empty" role="status">Choose at least 1 sensitivity lever.</p>}
      <small>Full re-optimization under the same forecast. Directional decision support—not guaranteed profit.</small>
    </section>
  );
}

export function SensitivitySummary({ items, onViewAll }: { items: SensitivityItem[]; onViewAll: () => void }) {
  if (!items.length) return null;
  const cases = items.flatMap((item) => [item.lower_case, item.upper_case]
    .filter(Boolean)
    .map((test) => ({ item, test: test as SensitivityCase })));
  const positive = [...cases].filter(({ test }) => test.delta_eur > 0).sort((a, b) => b.test.delta_eur - a.test.delta_eur)[0];
  const negative = [...cases].filter(({ test }) => test.delta_eur < 0).sort((a, b) => a.test.delta_eur - b.test.delta_eur)[0];
  const selected = [positive, negative].filter(Boolean) as Array<{ item: SensitivityItem; test: SensitivityCase }>;
  return <section className="sensitivity-summary" aria-labelledby="sensitivity-summary-title">
    <div><span className="chart-kicker">DECISION SUPPORT</span><h3 id="sensitivity-summary-title">Key Sensitivity Findings</h3><p>Largest tested opportunities and risks from full re-optimization.</p></div>
    <div className="sensitivity-summary-findings">{selected.map(({ item, test }) => <article key={`${item.key}-${test.value}`}><span>{test.delta_eur >= 0 ? "Largest upside" : "Largest downside"}</span><strong>{item.label}</strong><small>Test {number(test.value)} {test.unit}</small><b className={test.delta_eur >= 0 ? "positive" : "negative"}>{money(test.delta_eur)}</b></article>)}</div>
    <button type="button" className="secondary small" onClick={onViewAll}>View All Sensitivities</button>
  </section>;
}
