import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
  ComposedChart, Line, Area, ReferenceLine, CartesianGrid
} from "recharts";

// ---- palette (matches the GED deck) ----
const INK = "#0B1020";
const INK2 = "#121933";
const INDIGO = "#1B2B6B";
const VIOLET = "#6C5CE7";
const VIOLET_SOFT = "#8B7DF0";
const MINT = "#00E5A8";
const ICE = "#C9D4FF";
const SLATE = "#8B95AD";
const CORAL = "#FF6B6B";
const AMBER = "#FFB454";

const BUSINESS = {
  name: "Riverside HVAC & Plumbing",
  city: "Sacramento, CA",
  trailingRev: 482000,
  employees: 6,
  cashOnHand: 218000,
  monthlyBurn: 39800,
  revSlope: "+8.1%/yr",
  naics: "238220 · Plumbing/HVAC",
};

const POOL = { movers: 3847, nonMovers: 5210, total: 9057 };
const POOL_THIN = { movers: 287, nonMovers: 412, total: 699 };
const POOL_EXPANSION = { movers: 2341, nonMovers: 3180, total: 5521 };
const CONTROL_LIFT = 5;
const MIN_COHORT_FLOOR = 500;
const BACKTEST_N = 1200;
const BACKTEST_ERROR = 3.2;

const OUTCOMES_BY_HIRES = {
  1: {
    medianLift: 16, liftLo: 13, liftHi: 19, crunchShare: 18,
    dist: [
      { bucket: "-20%", share: 3, crunch: true }, { bucket: "-10%", share: 5, crunch: true },
      { bucket: "0%", share: 10, crunch: true }, { bucket: "+10%", share: 30, crunch: false },
      { bucket: "+20%", share: 28, crunch: false }, { bucket: "+30%", share: 16, crunch: false },
      { bucket: "+40%", share: 8, crunch: false },
    ],
  },
  2: {
    medianLift: 14, liftLo: 11, liftHi: 17, crunchShare: 25,
    dist: [
      { bucket: "-20%", share: 4, crunch: true }, { bucket: "-10%", share: 9, crunch: true },
      { bucket: "0%", share: 12, crunch: true }, { bucket: "+10%", share: 27, crunch: false },
      { bucket: "+20%", share: 24, crunch: false }, { bucket: "+30%", share: 14, crunch: false },
      { bucket: "+40%", share: 10, crunch: false },
    ],
  },
  3: {
    medianLift: 11, liftLo: 7, liftHi: 15, crunchShare: 32,
    dist: [
      { bucket: "-20%", share: 6, crunch: true }, { bucket: "-10%", share: 11, crunch: true },
      { bucket: "0%", share: 15, crunch: true }, { bucket: "+10%", share: 26, crunch: false },
      { bucket: "+20%", share: 22, crunch: false }, { bucket: "+30%", share: 12, crunch: false },
      { bucket: "+40%", share: 8, crunch: false },
    ],
  },
  4: {
    medianLift: 9, liftLo: 4, liftHi: 14, crunchShare: 38,
    dist: [
      { bucket: "-20%", share: 8, crunch: true }, { bucket: "-10%", share: 13, crunch: true },
      { bucket: "0%", share: 17, crunch: true }, { bucket: "+10%", share: 24, crunch: false },
      { bucket: "+20%", share: 20, crunch: false }, { bucket: "+30%", share: 12, crunch: false },
      { bucket: "+40%", share: 6, crunch: false },
    ],
  },
  5: {
    medianLift: 7, liftLo: 2, liftHi: 12, crunchShare: 44,
    dist: [
      { bucket: "-20%", share: 10, crunch: true }, { bucket: "-10%", share: 15, crunch: true },
      { bucket: "0%", share: 19, crunch: true }, { bucket: "+10%", share: 22, crunch: false },
      { bucket: "+20%", share: 18, crunch: false }, { bucket: "+30%", share: 10, crunch: false },
      { bucket: "+40%", share: 6, crunch: false },
    ],
  },
  6: {
    medianLift: 5, liftLo: 0, liftHi: 10, crunchShare: 50,
    dist: [
      { bucket: "-20%", share: 12, crunch: true }, { bucket: "-10%", share: 17, crunch: true },
      { bucket: "0%", share: 21, crunch: true }, { bucket: "+10%", share: 20, crunch: false },
      { bucket: "+20%", share: 16, crunch: false }, { bucket: "+30%", share: 10, crunch: false },
      { bucket: "+40%", share: 4, crunch: false },
    ],
  },
};

const EXPANSION_OUTCOMES = {
  medianLift: -8, liftLo: -18, liftHi: 2, crunchShare: 58,
  controlLift: 3,
  dist: [
    { bucket: "-20%", share: 18, crunch: true }, { bucket: "-10%", share: 22, crunch: true },
    { bucket: "0%", share: 18, crunch: true }, { bucket: "+10%", share: 16, crunch: false },
    { bucket: "+20%", share: 12, crunch: false }, { bucket: "+30%", share: 8, crunch: false },
    { bucket: "+40%", share: 6, crunch: false },
  ],
};

const HOW_IT_WORKS = [
  {
    title: "Projection engine",
    body: "Your ledger forward: a structural monthly cash-flow model runs on your actual burn, payroll adds, and capacity-ramp timing; matched retrieval then reweights the outcome distribution from k-NN businesses who made the same move — ledger physics for your future, matched history for the evidence.",
    lead: true,
  },
  { title: "Four-surface join", body: "Books, payroll, tax, and payments unified on a single entity ID and monthly time-series spine — the longitudinal join only Intuit can do at 8M+ scale." },
  { title: "Retrieval at scale", body: "Pre-decision trajectory embeddings over 8M businesses; k-nearest-neighbor cohort retrieval beats one global forecast model because every decision needs its own evidence set." },
  { title: "Latency & freshness", body: "Runs against nightly ledger snapshot + streaming payroll; target <3s p95 from plain-language query to distribution out." },
];

const DRILL_FILTERS = [
  { key: "subIndustry", label: "Sub-industry", match: "Plumbing/HVAC · NAICS 238220" },
  { key: "revenueBand", label: "Revenue band", match: "$400K–$600K trailing" },
  { key: "growthSlope", label: "Growth slope", match: "+6% to +10%/yr" },
  { key: "cashPosition", label: "Cash position", match: "$150K–$250K on hand" },
];

const QUICK_PROMPTS = [
  "Should I hire 2 people in Q3?",
  "Should I hire 3 technicians?",
  "Should I hire 1 dispatcher?",
  "Should I hire a commercial refrigeration specialist?",
  "Should I open a second location?",
];

function parseDecisionType(query) {
  const q = query.toLowerCase();
  if (/second location|open a (new )?location|second shop|expand to|new branch/i.test(q)) return "expansion";
  if (/refrigeration|marine|geothermal|niche specialist|asbestos|epoxy/i.test(q)) return "niche";
  return "hiring";
}

function shiftDistTowardCrunch(dist, factor) {
  const crunch = dist.filter((d) => d.crunch);
  const healthy = dist.filter((d) => !d.crunch);
  const crunchTotal = crunch.reduce((s, d) => s + d.share, 0);
  const targetCrunch = Math.min(Math.round(crunchTotal * factor), 65);
  const crunchScale = targetCrunch / crunchTotal;
  const healthyScale = (100 - targetCrunch) / healthy.reduce((s, d) => s + d.share, 0);
  return dist.map((d) => ({
    ...d,
    share: Math.max(0, Math.round(d.crunch ? d.share * crunchScale : d.share * healthyScale)),
  }));
}

function resolveBaseCohort(query, hires) {
  const type = parseDecisionType(query);
  const h = Math.min(Math.max(hires, 1), 6);

  if (type === "expansion") {
    const o = EXPANSION_OUTCOMES;
    return {
      type, verdict: "negative", pool: POOL_EXPANSION,
      movers: POOL_EXPANSION.movers, nonMovers: POOL_EXPANSION.nonMovers,
      medianLift: o.medianLift, liftLo: o.liftLo, liftHi: o.liftHi,
      crunchShare: o.crunchShare, crunchLo: 52, crunchHi: 64,
      controlLift: o.controlLift, dist: o.dist,
      confidence: "high", matchQuality: 0.88,
    };
  }

  const profile = OUTCOMES_BY_HIRES[h];
  if (type === "niche") {
    const crunchShare = profile.crunchShare + 6;
    return {
      type, verdict: "positive", pool: POOL_THIN,
      movers: POOL_THIN.movers, nonMovers: POOL_THIN.nonMovers,
      medianLift: profile.medianLift - 3, liftLo: profile.liftLo - 3, liftHi: profile.liftHi + 1,
      crunchShare, crunchLo: crunchShare - 6, crunchHi: crunchShare + 9,
      controlLift: CONTROL_LIFT + 1, dist: shiftDistTowardCrunch(profile.dist, 1.35),
      confidence: "low", matchQuality: 0.62,
    };
  }

  return {
    type, verdict: "positive", pool: POOL,
    movers: POOL.movers, nonMovers: POOL.nonMovers,
    medianLift: profile.medianLift, liftLo: profile.liftLo, liftHi: profile.liftHi,
    crunchShare: profile.crunchShare, crunchLo: profile.crunchShare - 3, crunchHi: profile.crunchShare + 3,
    controlLift: CONTROL_LIFT, dist: profile.dist,
    confidence: "high", matchQuality: 0.91,
  };
}

function applyDrillFilters(cohort, filters) {
  const penalty = Object.values(filters).reduce((s, v) => s + Math.abs(v), 0);
  if (penalty === 0) return cohort;

  const moverLoss = Math.round(penalty * 412);
  const movers = Math.max(180, cohort.movers - moverLoss);
  const nonMovers = Math.round(cohort.nonMovers * (movers / cohort.movers));
  const liftPenalty = Math.round(penalty * 1.5);
  const crunchBump = penalty * 4;

  return {
    ...cohort,
    movers, nonMovers,
    pool: { movers, nonMovers, total: movers + nonMovers },
    medianLift: cohort.medianLift - liftPenalty,
    liftLo: cohort.liftLo - liftPenalty * 2,
    liftHi: cohort.liftHi - liftPenalty,
    crunchShare: Math.min(62, cohort.crunchShare + crunchBump),
    crunchLo: cohort.crunchLo + crunchBump - 2,
    crunchHi: cohort.crunchHi + crunchBump,
    matchQuality: Math.max(0.45, cohort.matchQuality - penalty * 0.09),
    confidence: movers < MIN_COHORT_FLOOR ? "low" : penalty >= 3 ? "medium" : cohort.confidence,
    dist: shiftDistTowardCrunch(cohort.dist, 1 + penalty * 0.1),
    drillAdjusted: true,
  };
}

function buildCashSeries(hires, staggerWeeks, expansion = false) {
  const months = ["Now", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"];
  const staggerMonths = Math.ceil(staggerWeeks / 4.33);
  const hireCost = 6400;
  const monthlyRev = BUSINESS.trailingRev / 12;
  const expansionCost = expansion ? 18500 : 0;
  const expansionRevRamp = expansion ? 0.03 : 0;

  let cash = BUSINESS.cashOnHand;
  let cashAlt = BUSINESS.cashOnHand;

  return months.map((label, i) => {
    if (i > 0) {
      const activeHires = hires <= 1
        ? hires
        : i >= staggerMonths ? hires : 1;
      const burn = BUSINESS.monthlyBurn + activeHires * hireCost + (expansion ? expansionCost : 0);
      const ramp = i >= 3
        ? Math.min((i - 2) * 0.05 * activeHires, 0.16 * activeHires) + (expansion ? expansionRevRamp * (i - 2) : 0)
        : 0;
      const revWith = monthlyRev * (1 + ramp);
      cash += revWith - burn;
      cashAlt += monthlyRev - BUSINESS.monthlyBurn;
    }
    return { month: label, withHire: Math.round(cash), noHire: Math.round(cashAlt) };
  });
}

function computeUnderwriting(trough, crunchShare, hires) {
  const bridgeGap = Math.max(0, BUSINESS.cashOnHand * 0.55 - trough);
  const withBuffer = Math.ceil((bridgeGap * 1.15) / 5000) * 5000;
  const debtCap = Math.round((BUSINESS.trailingRev * 0.28) / 12 * 5);
  const amount = Math.min(Math.max(withBuffer || 35000, 25000), Math.min(80000, debtCap));
  const reason = amount < 80000
    ? `$${(amount / 1000).toFixed(0)}K covers M3–M5 trough (${fmtK(trough)}) + 15% buffer; $80K exceeds 28% debt-service cap on $482K trailing rev`
    : `$80K max — debt-service cap at 28% of trailing rev; trough needs ${fmtK(Math.abs(BUSINESS.cashOnHand * 0.55 - trough))} bridge`;
  const crunchNote = `${crunchShare}% cohort crunch rate at ${hires} hire${hires > 1 ? "s" : ""} supports ${fmtK(amount)} not ${fmtK(Math.min(80000, amount + 40000))}`;
  return { amount, reason, crunchNote };
}

function crunchHeadline(pct) {
  if (pct === 25) return "1 in 4";
  if (pct === 50) return "1 in 2";
  if (pct < 0) return `${pct}%`;
  return `1 in ${Math.max(2, Math.round(100 / pct))}`;
}

export default function App() {
  const [query, setQuery] = useState("Should I hire 2 people in Q3?");
  const [ran, setRan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [hireStaggerWeeks, setHireStaggerWeeks] = useState(0);
  const [filters, setFilters] = useState({ subIndustry: 0, revenueBand: 0, growthSlope: 0, cashPosition: 0 });

  const decisionType = useMemo(() => parseDecisionType(query), [query]);
  const hires = useMemo(() => {
    const m = query.match(/(\d+)/);
    const n = m ? parseInt(m[1], 10) : decisionType === "expansion" ? 1 : 2;
    return Math.min(Math.max(n, 1), 6);
  }, [query, decisionType]);

  const cohort = useMemo(() => {
    const base = resolveBaseCohort(query, hires);
    return applyDrillFilters(base, filters);
  }, [query, hires, filters]);

  const isNegative = cohort.verdict === "negative";
  const lowConf = cohort.confidence === "low";
  const medConf = cohort.confidence === "medium";
  const crunchLabel = crunchHeadline(cohort.crunchShare);

  const cashSeries = useMemo(
    () => buildCashSeries(hires, hireStaggerWeeks, isNegative),
    [hires, hireStaggerWeeks, isNegative],
  );
  const trough = Math.min(...cashSeries.map((d) => d.withHire));
  const troughMonth = cashSeries.find((d) => d.withHire === trough)?.month;
  const underwriting = useMemo(() => computeUnderwriting(trough, cohort.crunchShare, hires), [trough, cohort.crunchShare, hires]);

  const addedMonthlyCost = hires * 6400;
  const newBurn = BUSINESS.monthlyBurn + addedMonthlyCost + (isNegative ? 18500 : 0);
  const runwayBefore = +(BUSINESS.cashOnHand / BUSINESS.monthlyBurn).toFixed(1);
  const runwayAfter = +(BUSINESS.cashOnHand / newBurn).toFixed(1);

  const stagedTrough = useMemo(() => {
    const staged = buildCashSeries(hires, 6, isNegative);
    return Math.min(...staged.map((d) => d.withHire));
  }, [hires, isNegative]);

  const staggeredTrough = useMemo(() => {
    const s = buildCashSeries(hires, hireStaggerWeeks, isNegative);
    return Math.min(...s.map((d) => d.withHire));
  }, [hires, hireStaggerWeeks, isNegative]);

  const run = () => {
    setLoading(true);
    setRan(false);
    setTimeout(() => { setLoading(false); setRan(true); }, 950);
  };

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      background: `radial-gradient(1200px 600px at 80% -10%, ${INDIGO}55, transparent), ${INK}`,
      minHeight: "100vh", color: "#fff", padding: "0",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform: translateY(12px);} to {opacity:1; transform:none;} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        .card { animation: fadeUp .5s ease both; }
        .grid-bg { background-image: linear-gradient(${VIOLET}14 1px, transparent 1px), linear-gradient(90deg, ${VIOLET}14 1px, transparent 1px); background-size: 46px 46px; }
        input::placeholder { color: ${SLATE}; }
        input[type=range] { accent-color: ${MINT}; width: 100%; }
        .runbtn:hover { filter: brightness(1.08); }
        .runbtn:active { transform: translateY(1px); }
      `}</style>

      <div className="grid-bg" style={{ borderBottom: `1px solid ${INDIGO}`, padding: "20px 30px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Business Twin</div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: MINT, border: `1px solid ${MINT}55`, padding: "3px 8px", borderRadius: 20, letterSpacing: 1 }}>AGENT · GED 2026 PROTOTYPE</span>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: SLATE, border: `1px solid ${INDIGO}`, padding: "3px 8px", borderRadius: 20 }}>v1 · hiring decisions · QBO Advanced cohort</span>
        </div>
        <div style={{ color: ICE, fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 14, marginTop: 6 }}>
          Predict your future from the real futures of millions like you.
        </div>
        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", background: INK2, border: `1px solid ${INDIGO}`, borderRadius: 12, padding: "12px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{BUSINESS.name}</div>
          {[["Trailing rev", "$482K"], ["Cash", "$218K"], ["Team", `${BUSINESS.employees}`], ["Rev slope", BUSINESS.revSlope], ["NAICS", BUSINESS.naics], ["Location", BUSINESS.city]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, color: SLATE, textTransform: "uppercase", letterSpacing: 1 }}>{k}</span>
              <span style={{ fontSize: 13, color: ICE, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 30px 60px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, background: INK2, border: `1px solid ${VIOLET}66`, borderRadius: 14, padding: "0 18px" }}>
            <span style={{ color: VIOLET_SOFT, fontSize: 18 }}>◑</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Describe a decision…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 18, fontFamily: "Georgia, serif", fontStyle: "italic", padding: "16px 0" }} />
          </div>
          <button className="runbtn" onClick={run} style={{ background: MINT, color: INK, border: "none", borderRadius: 14, padding: "0 30px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            {loading ? "MATCHING…" : "RUN"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {QUICK_PROMPTS.map((q) => (
            <button key={q} onClick={() => setQuery(q)} style={{
              background: "transparent", color: q.includes("second location") ? CORAL : SLATE,
              border: `1px solid ${q.includes("second location") ? CORAL : INDIGO}55`, borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer",
            }}>{q}</button>
          ))}
        </div>

        <div style={{ marginTop: 14, background: INK2, border: `1px solid ${INDIGO}`, borderRadius: 12, overflow: "hidden" }}>
          <button type="button" onClick={() => setHowOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", color: ICE, padding: "12px 16px", cursor: "pointer", fontFamily: "monospace", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
            <span>How this works</span>
            <span style={{ color: VIOLET_SOFT }}>{howOpen ? "−" : "+"}</span>
          </button>
          {howOpen && (
            <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {HOW_IT_WORKS.map(({ title, body, lead }) => (
                <div key={title} style={{ fontSize: lead ? 13 : 12.5, color: ICE, lineHeight: 1.55, ...(lead ? { background: `${VIOLET}22`, borderRadius: 8, padding: "10px 12px", border: `1px solid ${VIOLET}44` } : {}) }}>
                  <b style={{ color: VIOLET_SOFT }}>{title}.</b> {body}
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ marginTop: 40, textAlign: "center", color: SLATE }}>
            <div style={{ fontFamily: "monospace", fontSize: 13, animation: "pulse 1s infinite" }}>
              Matching {cohort.pool.total.toLocaleString()}-business pool ({cohort.movers.toLocaleString()} movers) on pre-decision trajectory…
            </div>
          </div>
        )}

        {ran && !loading && (
          <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 18 }}>

            {/* backtest validation strip */}
            <div className="card" style={{ background: `${MINT}12`, border: `1px solid ${MINT}44`, borderRadius: 12, padding: "10px 16px", fontSize: 12.5, color: ICE, lineHeight: 1.5 }}>
              <b style={{ color: MINT }}>Validation holdout:</b> {BACKTEST_N.toLocaleString()} businesses that already made this move were held out of training;
              blind prediction landed within <b style={{ color: MINT }}>{BACKTEST_ERROR}%</b> of actual median 6-mo lift (MAPE on holdout set).
            </div>

            {isNegative && (
              <div className="card" style={{ background: `${CORAL}22`, border: `1px solid ${CORAL}`, borderRadius: 12, padding: "14px 16px", fontSize: 14, color: "#fff", lineHeight: 1.5 }}>
                <b style={{ color: CORAL, fontSize: 16 }}>⛔ Recommendation: wait</b> — cohort evidence is against this move right now.
                Median mover lost <b style={{ color: CORAL }}>{Math.abs(cohort.medianLift)}% revenue</b> over 6 months; <b style={{ color: CORAL }}>{cohort.crunchShare}%</b> hit a cash crunch.
                Your ledger can't absorb the upfront burn without breaching runway.
              </div>
            )}

            {(lowConf || medConf) && !isNegative && (
              <div className="card" style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}88`, borderRadius: 12, padding: "12px 16px", fontSize: 12.5, color: ICE, lineHeight: 1.5 }}>
                <b style={{ color: AMBER }}>● {lowConf ? "Low" : "Medium"} confidence</b> — {cohort.movers.toLocaleString()} matched movers of {cohort.pool.total.toLocaleString()} in pool
                {lowConf ? ` (below ${MIN_COHORT_FLOOR}-match floor)` : ""}.
                Bands widened; match quality {Math.round(cohort.matchQuality * 100)}%.
              </div>
            )}

            <div className="card" style={{ background: `${VIOLET}1a`, border: `1px solid ${VIOLET}55`, borderRadius: 12, padding: "12px 16px", fontSize: 12.5, color: ICE, lineHeight: 1.5 }}>
              <b style={{ color: VIOLET_SOFT }}>Matched pool:</b> {cohort.pool.total.toLocaleString()} businesses total —{" "}
              <b>{cohort.movers.toLocaleString()} movers</b> + <b>{cohort.nonMovers.toLocaleString()} matched non-movers</b>.
              Movers matched on <b>pre-decision trajectory</b> — not just size + NAICS. Aggregate-only outputs (k-anonymity, min-cohort suppression).
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 18 }}>
              <div className="card" style={panel}>
                <Label n="01" t="YOUR PROJECTED FUTURE" sub="Modeled on your real ledger" />
                <div style={{ display: "flex", gap: 24, margin: "14px 0 6px" }}>
                  <Stat label="Runway" before={`${runwayBefore} mo`} after={`${runwayAfter} mo`} bad />
                  <Stat label="Monthly burn" before={fmtK(BUSINESS.monthlyBurn)} after={fmtK(newBurn)} bad />
                  <Stat label="Added cost/mo" after={fmtK(addedMonthlyCost + (isNegative ? 18500 : 0))} note={isNegative ? "2nd location" : `${hires} hire${hires > 1 ? "s" : ""}`} />
                </div>
                <div style={{ height: 188, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={INDIGO} vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: SLATE, fontSize: 11 }} axisLine={{ stroke: INDIGO }} tickLine={false} />
                      <YAxis tick={{ fill: SLATE, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}K`} />
                      <Tooltip contentStyle={tipStyle} formatter={(v) => `$${v.toLocaleString()}`} />
                      <ReferenceLine y={0} stroke={CORAL} strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="withHire" stroke={isNegative ? CORAL : MINT} fill={isNegative ? `${CORAL}22` : `${MINT}22`} strokeWidth={2.5} name="With move" />
                      <Line type="monotone" dataKey="noHire" stroke={SLATE} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Status quo" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 12, color: SLATE }}>
                  Projected cash {isNegative ? "falls to" : "dips to"} <b style={{ color: AMBER }}>{fmtK(trough)}</b> at <b style={{ color: AMBER }}>{troughMonth}</b>
                  {hireStaggerWeeks > 0 && !isNegative && <> (staggered: <b style={{ color: MINT }}>{fmtK(stagedTrough)}</b> at 6 wk delay)</>}.
                </div>
              </div>

              <div className="card" style={{ ...panel, animationDelay: ".08s", borderColor: isNegative ? `${CORAL}66` : lowConf ? `${AMBER}55` : panel.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Label n="02" t="YOUR COHORT'S OUTCOMES" sub={null} />
                  <button type="button" onClick={() => setDrillOpen((o) => !o)} style={{ background: "transparent", border: `1px solid ${VIOLET}66`, color: VIOLET_SOFT, borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>
                    {cohort.movers.toLocaleString()} movers ▾
                  </button>
                </div>
                <div style={{ fontSize: 11, color: SLATE, marginTop: -4, marginBottom: 8 }}>
                  {cohort.movers.toLocaleString()} of {cohort.pool.total.toLocaleString()} in matched pool
                  {cohort.drillAdjusted && <span style={{ color: AMBER }}> · filters adjusted</span>}
                </div>

                {drillOpen && (
                  <div style={{ background: INK, border: `1px solid ${INDIGO}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: SLATE, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Match criteria — nudge to test sensitivity</div>
                    {DRILL_FILTERS.map(({ key, label, match }) => (
                      <div key={key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: ICE, marginBottom: 4 }}>
                          <span>{label}</span>
                          <span style={{ color: SLATE }}>{match}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, color: SLATE }}>looser</span>
                          <input type="range" min={-2} max={2} step={1} value={filters[key]}
                            onChange={(e) => setFilter(key, +e.target.value)} />
                          <span style={{ fontSize: 10, color: SLATE }}>tighter</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 20, margin: "6px 0 2px" }}>
                  <BigNum
                    v={lowConf || isNegative ? `${cohort.medianLift > 0 ? "+" : ""}${cohort.liftLo}–${cohort.liftHi}%` : `+${cohort.medianLift}%`}
                    c={isNegative ? CORAL : lowConf || medConf ? AMBER : MINT}
                    label={isNegative ? "median revenue change · 6 mo" : lowConf ? "revenue lift band · 6 mo" : "median revenue lift · 6 mo"}
                    confidence={`n=${cohort.movers.toLocaleString()} · ${cohort.confidence} confidence`}
                    dimmed={lowConf || medConf}
                  />
                  <BigNum
                    v={crunchLabel}
                    c={CORAL}
                    label={`hit a cash crunch in month 4 (${cohort.crunchShare}%)`}
                    confidence={`${cohort.crunchShare}% of ${cohort.movers.toLocaleString()} movers`}
                    dimmed={lowConf}
                  />
                </div>
                <div style={{ height: 150, marginTop: 6 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cohort.dist} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                      <XAxis dataKey="bucket" tick={{ fill: SLATE, fontSize: 10 }} axisLine={{ stroke: INDIGO }} tickLine={false} />
                      <YAxis tick={{ fill: SLATE, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={tipStyle} formatter={(v, _n, p) => [`${v}% of cohort`, p.payload.crunch ? "downside" : "healthy"]} />
                      <Bar dataKey="share" radius={[3, 3, 0, 0]}>
                        {cohort.dist.map((d, i) => <Cell key={i} fill={d.crunch ? CORAL : MINT} fillOpacity={d.crunch ? 0.85 : 0.9} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: ICE, background: `${INDIGO}66`, borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
                  <b style={{ color: VIOLET_SOFT }}>Counterfactual:</b> non-movers saw +{cohort.controlLift}% median.
                  {isNegative
                    ? <> Opening now is associated with a <b style={{ color: CORAL }}>~{cohort.medianLift - cohort.controlLift}pt drag</b> vs. waiting.</>
                    : <> The hire is associated with a <b style={{ color: MINT }}>~{cohort.medianLift - cohort.controlLift}pt</b> incremental lift.</>}
                </div>
              </div>
            </div>

            <div className="card" style={{ ...panel, animationDelay: ".16s", borderColor: isNegative ? `${CORAL}88` : `${AMBER}55` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <Label n="03" t={isNegative ? "WHY NOT NOW" : "RISK + MITIGATION"} sub={isNegative ? "What the cohort says" : "What the agent recommends"} amber={!isNegative} red={isNegative} />
                  <div style={{ marginTop: 12, fontSize: 14.5, color: "#fff", lineHeight: 1.5 }}>
                    {isNegative ? (
                      <>At your cash position, a second location pushes burn to <b style={{ color: CORAL }}>{fmtK(newBurn)}/mo</b> before revenue ramps.
                      <b style={{ color: CORAL }}> {cohort.crunchShare}%</b> of similar movers hit crunch in month 4. Wait until cash exceeds <b style={{ color: MINT }}>$320K</b> or rev slope holds +12% for 2 quarters.</>
                    ) : (
                      <>Hiring {hires} at once pushes cash to <b style={{ color: AMBER }}>{fmtK(trough)}</b> in {troughMonth} —
                      the month <b style={{ color: CORAL }}>{cohort.crunchShare}%</b> ({crunchLabel}) of your {cohort.movers.toLocaleString()} movers hit a crunch. Stay out of that {cohort.crunchShare}%:</>
                    )}
                  </div>

                  {!isNegative && hires > 1 && (
                    <div style={{ marginTop: 16, background: INK, borderRadius: 10, padding: "12px 14px", border: `1px solid ${INDIGO}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: ICE, marginBottom: 8 }}>
                        <span>Stage the second hire</span>
                        <span style={{ color: hireStaggerWeeks > 0 ? MINT : SLATE, fontWeight: 700 }}>{hireStaggerWeeks === 0 ? "hire both now" : `${hireStaggerWeeks} weeks later`}</span>
                      </div>
                      <input type="range" min={0} max={12} step={2} value={hireStaggerWeeks}
                        onChange={(e) => setHireStaggerWeeks(+e.target.value)} />
                      <div style={{ fontSize: 11, color: SLATE, marginTop: 6 }}>
                        Trough moves from <b style={{ color: AMBER }}>{fmtK(trough)}</b> → <b style={{ color: MINT }}>{fmtK(staggeredTrough)}</b> as you drag
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {(isNegative
                      ? ["Defer the lease decision 2 quarters — cohort non-movers outperformed movers by 11pt.", "Build cash to $320K first, then re-run this simulation."]
                      : [
                          `Stage the ${hires > 1 ? "second hire" : "hire"} ${hireStaggerWeeks || 6} weeks later — flattens trough to ${fmtK(staggeredTrough || stagedTrough)}.`,
                          `Or secure a ${fmtK(underwriting.amount)} line of credit before hiring to bridge months 3–4.`,
                        ]
                    ).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: ICE }}>
                        <span style={{ color: isNegative ? CORAL : MINT, fontWeight: 800 }}>{isNegative ? "✕" : "✓"}</span>{r}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ width: 260, background: INK2, border: `1px solid ${isNegative ? `${CORAL}44` : `${MINT}44`}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10, color: SLATE, letterSpacing: 1, textTransform: "uppercase" }}>Agent can act</div>
                  {!isNegative && (
                    <>
                      <button style={actionBtn(MINT)}>Open {fmtK(underwriting.amount)} line · QuickBooks Capital →</button>
                      <div style={{ fontSize: 10.5, color: ICE, marginTop: 6, lineHeight: 1.45, background: `${MINT}11`, borderRadius: 6, padding: "6px 8px", border: `1px solid ${MINT}33` }}>
                        <b style={{ color: MINT }}>Why {fmtK(underwriting.amount)}, not $80K?</b> {underwriting.reason}. {underwriting.crunchNote}.
                      </div>
                      <button style={actionBtn(VIOLET_SOFT)}>Set up the {hires} hire{hires > 1 ? "s" : ""} · Payroll →</button>
                    </>
                  )}
                  {isNegative && (
                    <button style={actionBtn(CORAL)}>Set a cash target alert · $320K →</button>
                  )}
                  <div style={{ fontSize: 10.5, color: SLATE, marginTop: 8, lineHeight: 1.4 }}>
                    {isNegative ? "Honest no — builds trust for the yes." : "Simulation → underwriting → origination in one surface."}
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ animationDelay: ".22s", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 12, color: SLATE, borderTop: `1px solid ${INDIGO}`, paddingTop: 14 }}>
              <div>
                <span style={{ color: lowConf ? AMBER : medConf ? AMBER : MINT }}>● {cohort.confidence} confidence</span>
                {" "}— movers n={cohort.movers.toLocaleString()} of pool {cohort.pool.total.toLocaleString()}.
                Match quality {Math.round(cohort.matchQuality * 100)}%.
              </div>
              <div style={{ fontStyle: "italic" }}>Prototype · mock data · v1 hiring + expansion preview</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const panel = { background: INK2, border: `1px solid ${INDIGO}`, borderRadius: 16, padding: 18 };
const tipStyle = { background: INK, border: `1px solid ${VIOLET}`, borderRadius: 8, color: "#fff", fontSize: 12 };

function Label({ n, t, sub, amber, red }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: red ? CORAL : amber ? AMBER : VIOLET_SOFT }}>{n}</span>
      <div>
        <div style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: 1.5, color: red ? CORAL : amber ? AMBER : MINT, fontWeight: 700 }}>{t}</div>
        {sub && <div style={{ fontSize: 11, color: SLATE }}>{sub}</div>}
      </div>
    </div>
  );
}

function Stat({ label, before, after, note, bad }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: SLATE, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
        {before && <span style={{ fontSize: 13, color: SLATE, textDecoration: "line-through" }}>{before}</span>}
        {before && <span style={{ color: SLATE }}>→</span>}
        <span style={{ fontSize: 19, fontWeight: 800, color: bad ? AMBER : "#fff" }}>{after}</span>
      </div>
      {note && <div style={{ fontSize: 10, color: SLATE }}>{note}</div>}
    </div>
  );
}

function BigNum({ v, c, label, confidence, dimmed }) {
  return (
    <div style={{ opacity: dimmed ? 0.82 : 1 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
      <div style={{ fontSize: 11, color: SLATE, marginTop: 4, maxWidth: 150, lineHeight: 1.3 }}>{label}</div>
      {confidence && <div style={{ fontSize: 10, marginTop: 5, fontFamily: "monospace", color: dimmed ? AMBER : MINT }}>{confidence}</div>}
    </div>
  );
}

const actionBtn = (c) => ({
  display: "block", width: "100%", marginTop: 8, background: "transparent",
  color: c, border: `1px solid ${c}66`, borderRadius: 8, padding: "9px 10px",
  fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left",
});

function fmtK(n) {
  const neg = n < 0; const a = Math.abs(n);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}K` : `$${a}`;
  return neg ? `-${s}` : s;
}
