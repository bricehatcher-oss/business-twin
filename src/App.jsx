import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INK = "#1F2523";
const DEEP = "#0B1F1A";
const QBO = "#2CA01C";
const BLUE = "#236CFF";
const WARN = "#F2B84B";
const RED = "#D52B1E";
const BG = "#F7F9F8";
const SURFACE = "#FFFFFF";
const LINE = "#DDE7E1";
const MUTED = "#66736E";

const BUSINESS = {
  name: "Riverside HVAC & Plumbing",
  city: "Sacramento, CA",
  trailingRev: 482000,
  cash: 218000,
  burn: 39800,
  employees: 6,
  revSlope: "+8.1%/yr",
  naics: "238220",
};

const DEFAULT_ASSUMPTIONS = {
  targetProfit: 12000,
  grossMargin: 0.42,
  avgJobValue: 850,
  jobsPerPerson: 18,
  conversionRate: 0.78,
  loadedCostPerHire: 6400,
  softwareCost: 850,
  rampMonths: 3,
};

const QUICK_PROMPTS = [
  "Should I hire 2 people in Q3?",
  "Can I raise prices 10%?",
  "Should I take a $40K loan?",
  "Should I open a second location?",
  "Should I buy a new service truck?",
  "Should I add refrigeration services?",
  "Should I cut one payroll role?",
];

const DECISION_TYPES = [
  { key: "hire", label: "Hire", status: "Live v1", color: QBO, mini: [42, 49, 56, 62, 68, 76] },
  { key: "pricing", label: "Prices", status: "Same engine", color: BLUE, mini: [42, 45, 47, 50, 54, 57] },
  { key: "capital", label: "Capital", status: "Attached", color: BLUE, mini: [42, 43, 44, 49, 53, 58] },
  { key: "expansion", label: "Location", status: "Preview", color: RED, mini: [42, 37, 31, 28, 32, 38] },
  { key: "equipment", label: "Equipment", status: "Next", color: MUTED, mini: [42, 39, 41, 45, 48, 52] },
  { key: "service", label: "Services", status: "Next", color: MUTED, mini: [42, 42, 46, 51, 55, 61] },
  { key: "payroll", label: "Payroll", status: "Next", color: MUTED, mini: [42, 44, 43, 45, 46, 48] },
];

const SIGNALS = {
  hire: {
    basis: "Payroll start dates + employee count + wage expense",
    strength: "High",
    note: "If Payroll is absent, the Twin downgrades to ledger-inferred confidence.",
  },
  pricing: {
    basis: "Invoice amounts + item prices + payment conversion + margin",
    strength: "Medium",
    note: "Price changes are observed through invoice/payment behavior, not guessed.",
  },
  capital: {
    basis: "Capital application + cash inflow + debt-service capacity",
    strength: "High",
    note: "The recommendation is tied to the same underwriting evidence.",
  },
  expansion: {
    basis: "Rent/lease increase + new address/location signal + payroll shift",
    strength: "Medium",
    note: "Second-location detection needs lease or location evidence.",
  },
  equipment: {
    basis: "Asset purchase + category spend + depreciation pattern",
    strength: "Medium",
    note: "Large purchases are visible in books before they affect runway.",
  },
  service: {
    basis: "New revenue category + invoice text shift + technician mix",
    strength: "Inferred",
    note: "New services require category or invoice-language evidence.",
  },
  payroll: {
    basis: "Termination/offboarding + payroll expense drop",
    strength: "High",
    note: "Firing/role changes are strongest when Payroll is the action surface.",
  },
  unknown: {
    basis: "No supported decision signal",
    strength: "Unsupported",
    note: "V1 supports decisions Intuit can observe through Payroll, Books, Payments, Capital, or Tax signals.",
  },
};

const MATCH_FACTORS = [
  ["Revenue slope", "32%"],
  ["Cash position", "26%"],
  ["NAICS / location", "18%"],
  ["Team size", "14%"],
  ["Seasonality", "10%"],
];

const BACKTEST = [
  { bucket: "0-10", predicted: 9, actual: 10 },
  { bucket: "10-20", predicted: 38, actual: 36 },
  { bucket: "20-30", predicted: 31, actual: 33 },
  { bucket: "30+", predicted: 22, actual: 21 },
];

const RISK_HEAT = [
  { month: "M1", low: 12, med: 18, high: 25 },
  { month: "M2", low: 16, med: 26, high: 38 },
  { month: "M3", low: 21, med: 35, high: 52 },
  { month: "M4", low: 25, med: 44, high: 64 },
  { month: "M5", low: 20, med: 38, high: 55 },
  { month: "M6", low: 14, med: 29, high: 41 },
];

const DATA_SCHEMA = "id,decision_type,treated,revenue_slope,cash_ratio,employees,margin,seasonality,pre_revenue,post_revenue_lift,post_cash_min,crunch_month";

function makeDemoRows(size = 900) {
  const types = ["hire", "pricing", "capital", "expansion", "equipment", "service", "payroll"];
  return Array.from({ length: size }, (_, i) => {
    const decisionType = types[i % types.length];
    const revenueSlope = 0.02 + ((i * 17) % 18) / 100;
    const cashRatio = 1.8 + ((i * 31) % 54) / 10;
    const employees = 2 + ((i * 7) % 18);
    const margin = 0.12 + ((i * 13) % 28) / 100;
    const seasonality = ((i * 19) % 100) / 100;
    const preRevenue = 220000 + ((i * 7919) % 780000);
    const propensitySeed = 0.18 + revenueSlope * 1.7 + cashRatio * 0.07 + margin * 0.5 - (decisionType === "expansion" ? 0.12 : 0);
    const treated = ((i * 37) % 100) / 100 < Math.min(0.78, propensitySeed);
    const baseLift = revenueSlope * 45 + margin * 18 + seasonality * 2;
    const treatmentEffect = decisionType === "expansion" ? -9 : decisionType === "hire" ? 8 : decisionType === "pricing" ? 5 : decisionType === "capital" ? 3 : decisionType === "service" ? 7 : 2;
    const noise = (((i * 97) % 100) - 50) / 8;
    const postRevenueLift = baseLift + (treated ? treatmentEffect : 0) + noise;
    const postCashMin = Math.round(45000 + cashRatio * 32000 - (treated ? Math.max(0, treatmentEffect) * 2200 : 0) + noise * 900);
    const crunchMonth = postCashMin < 95000 ? 3 + (i % 3) : 0;

    return {
      id: `biz_${String(i + 1).padStart(4, "0")}`,
      decision_type: decisionType,
      treated: treated ? 1 : 0,
      revenue_slope: revenueSlope,
      cash_ratio: cashRatio,
      employees,
      margin,
      seasonality,
      pre_revenue: preRevenue,
      post_revenue_lift: Number(postRevenueLift.toFixed(2)),
      post_cash_min: postCashMin,
      crunch_month: crunchMonth,
    };
  });
}

function classifyDecision(text) {
  const q = text.toLowerCase().trim();
  if (!q) return "empty";
  if (/second location|new location|lease|expand|branch/.test(q)) return "expansion";
  if (/price|pricing|raise.*%|increase.*price/.test(q)) return "pricing";
  if (/loan|capital|line|borrow|debt/.test(q)) return "capital";
  if (/truck|equipment|van|machine|asset/.test(q)) return "equipment";
  if (/refrigeration|new service|add .*service|services/.test(q)) return "service";
  if (/cut|fire|layoff|reduce payroll|terminate/.test(q)) return "payroll";
  if (/hire|hiring|employee|people|person|technician|dispatcher|staff/.test(q)) return "hire";
  return "unknown";
}

function parseCount(text, type) {
  const match = text.match(/(\d+)/);
  if (match) return Math.min(Math.max(parseInt(match[1], 10), 1), 6);
  if (type === "hire" || type === "service" || type === "payroll") return 1;
  return 0;
}

function getDecisionModel(text, timing) {
  const type = classifyDecision(text);
  const count = parseCount(text, type);
  const signal = SIGNALS[type] || SIGNALS.unknown;
  const isNo = type === "expansion";
  const isUnsupported = type === "empty" || type === "unknown";
  const addedCost = type === "expansion" ? 18500 : type === "hire" || type === "service" ? count * 6400 : type === "equipment" ? 4200 : type === "capital" ? -40000 : 0;
  const median = type === "hire" ? Math.max(6, 18 - count * 2) : type === "pricing" ? 9 : type === "capital" ? 4 : type === "equipment" ? 7 : type === "service" ? 12 : type === "payroll" ? 2 : -8;
  const crunch = type === "hire" ? Math.min(48, 15 + count * 5) : type === "pricing" ? 17 : type === "capital" ? 12 : type === "equipment" ? 28 : type === "service" ? 34 : type === "payroll" ? 9 : 58;
  const movers = type === "hire" ? Math.max(2400, 4250 - count * 210) : type === "pricing" ? 3180 : type === "capital" ? 5110 : type === "equipment" ? 1740 : type === "service" ? 690 : type === "payroll" ? 2840 : 2341;
  const controls = Math.round(movers * 1.33);

  return {
    type,
    count,
    signal,
    unsupported: isUnsupported,
    verdict: isUnsupported ? "unsupported" : isNo ? "wait" : signal.strength === "Inferred" ? "caution" : "go",
    decisionLabel: labelDecision(text, type, count),
    timing,
    addedCost,
    median,
    control: type === "expansion" ? 3 : 5,
    crunch,
    movers,
    controls,
    confidence: signal.strength === "High" ? "High confidence" : signal.strength === "Medium" ? "Medium confidence" : signal.strength === "Inferred" ? "Inferred confidence" : "No confidence",
  };
}

function labelDecision(text, type, count) {
  if (type === "empty") return "No decision entered";
  if (type === "unknown") return "Unsupported decision";
  if (type === "hire") return `Hire ${count} ${count === 1 ? "person" : "people"}`;
  if (type === "pricing") return "Raise prices";
  if (type === "capital") return "Take capital";
  if (type === "expansion") return "Open second location";
  if (type === "equipment") return "Buy equipment";
  if (type === "service") return "Add refrigeration services";
  if (type === "payroll") return `Cut ${count} payroll ${count === 1 ? "role" : "roles"}`;
  return text;
}

function assumptionMath(model, assumptions) {
  const activePeople = Math.max(1, model.count || 1);
  const hireLike = model.type === "hire" || model.type === "service";
  const monthlyPeopleCost = hireLike ? activePeople * assumptions.loadedCostPerHire : 0;
  const addedFixedCost = model.type === "expansion" ? 18500 : model.type === "equipment" ? 4200 : 0;
  const softwareCost = hireLike || model.type === "equipment" || model.type === "service" ? assumptions.softwareCost : 0;
  const addedMonthlyCost = monthlyPeopleCost + addedFixedCost + softwareCost;
  const requiredGrossProfit = addedMonthlyCost + assumptions.targetProfit;
  const breakEvenRevenue = requiredGrossProfit / Math.max(0.01, assumptions.grossMargin);
  const jobsToBreakEven = breakEvenRevenue / Math.max(1, assumptions.avgJobValue);
  const expectedRevenue = hireLike
    ? activePeople * assumptions.jobsPerPerson * assumptions.avgJobValue * assumptions.conversionRate
    : model.type === "pricing"
      ? (BUSINESS.trailingRev / 12) * 0.1 * assumptions.conversionRate
      : model.type === "capital"
        ? assumptions.targetProfit * 0.25
        : 0;
  const expectedGrossProfit = expectedRevenue * assumptions.grossMargin;
  const netProfitImpact = expectedGrossProfit - addedMonthlyCost;
  const breakEvenStatus = netProfitImpact >= assumptions.targetProfit ? "above target" : netProfitImpact >= 0 ? "break-even only" : "below break-even";

  return {
    activePeople,
    addedMonthlyCost,
    breakEvenRevenue,
    jobsToBreakEven,
    expectedRevenue,
    expectedGrossProfit,
    netProfitImpact,
    breakEvenStatus,
  };
}

function cashSeries(model, staggerWeeks, assumptions = DEFAULT_ASSUMPTIONS) {
  const months = ["Now", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"];
  const monthlyRev = BUSINESS.trailingRev / 12;
  let moveCash = BUSINESS.cash;
  let statusCash = BUSINESS.cash;
  let stagedCash = BUSINESS.cash;
  const staggerMonths = Math.max(2, Math.ceil(staggerWeeks / 4.33));
  const math = assumptionMath(model, assumptions);

  return months.map((month, index) => {
    if (index > 0) {
      const rampProgress = Math.min(1, index / Math.max(1, assumptions.rampMonths));
      const ramp = index >= 2 ? Math.min((index - 1) * 0.045 * Math.max(model.count, 1), 0.22) : 0;
      const cost = model.type === "capital" ? -Math.abs(model.addedCost) / 6 : model.addedCost;
      const assumptionCost = model.type === "capital" ? cost : math.addedMonthlyCost;
      const stagedCost = model.type === "hire" && model.count > 1 && index < staggerMonths
        ? assumptions.loadedCostPerHire + assumptions.softwareCost
        : assumptionCost;
      const expansionPenalty = model.type === "expansion" ? 0.09 : 0;
      const incrementalProfit = math.netProfitImpact * rampProgress;
      moveCash += monthlyRev * (1 + ramp - expansionPenalty) - BUSINESS.burn - Math.max(0, assumptionCost) + incrementalProfit;
      stagedCash += monthlyRev * (1 + ramp) - BUSINESS.burn - Math.max(0, stagedCost) + incrementalProfit;
      statusCash += monthlyRev - BUSINESS.burn;
    }

    return {
      month,
      status: Math.round(statusCash),
      move: Math.round(moveCash),
      staged: Math.round(stagedCash),
      crunch: Math.round(BUSINESS.cash * 0.55),
    };
  });
}

function distribution(model) {
  const crunch = model.crunch;
  const negative = model.verdict === "wait";
  return [
    { bucket: "-20%", value: negative ? 18 : Math.round(crunch * 0.15), bad: true },
    { bucket: "-10%", value: negative ? 22 : Math.round(crunch * 0.28), bad: true },
    { bucket: "0%", value: negative ? 18 : Math.max(6, Math.round(crunch * 0.3)), bad: true },
    { bucket: "+10%", value: negative ? 16 : 27, bad: false },
    { bucket: "+20%", value: negative ? 12 : 24, bad: false },
    { bucket: "+30%", value: negative ? 8 : 14, bad: false },
    { bucket: "+40%", value: negative ? 6 : 10, bad: false },
  ];
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
}

function riskColor(value) {
  if (value >= 52) return RED;
  if (value >= 34) return WARN;
  return QBO;
}

function parseUploadedData(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(normalizeRow) : (parsed.rows || []).map(normalizeRow);
  }

  const [headerLine, ...lines] = trimmed.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((h) => h.trim());
  return lines.map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return normalizeRow(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  });
}

function normalizeRow(row) {
  return {
    id: String(row.id || cryptoSafeId()),
    decision_type: String(row.decision_type || row.type || "hire"),
    treated: Number(row.treated || row.made_move || 0),
    revenue_slope: Number(row.revenue_slope || 0),
    cash_ratio: Number(row.cash_ratio || 0),
    employees: Number(row.employees || 0),
    margin: Number(row.margin || 0),
    seasonality: Number(row.seasonality || 0),
    pre_revenue: Number(row.pre_revenue || 0),
    post_revenue_lift: Number(row.post_revenue_lift || 0),
    post_cash_min: Number(row.post_cash_min || 0),
    crunch_month: Number(row.crunch_month || 0),
  };
}

function cryptoSafeId() {
  return `row_${Math.random().toString(36).slice(2, 9)}`;
}

function featuresFor(row) {
  return [row.revenue_slope, row.cash_ratio, row.employees / 10, row.margin, row.seasonality];
}

function distance(a, b) {
  const af = featuresFor(a);
  const bf = featuresFor(b);
  return Math.sqrt(af.reduce((sum, value, index) => sum + (value - bf[index]) ** 2, 0));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function propensityScore(row) {
  return sigmoid(-1.1 + row.revenue_slope * 5.4 + row.cash_ratio * 0.18 + row.margin * 1.6 + row.seasonality * 0.42 - row.employees * 0.015);
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((pct / 100) * sorted.length)));
  return sorted[index];
}

function runDecisionEngine(rows, model) {
  const sameType = rows.filter((row) => row.decision_type === model.type);
  const population = sameType.length >= 40 ? sameType : rows;
  const treated = population.filter((row) => row.treated === 1);
  const controls = population.filter((row) => row.treated !== 1);

  if (treated.length < 10 || controls.length < 10) {
    return emptyEngine(rows.length, model.type);
  }

  const matchedPairs = treated.map((mover) => {
    const moverScore = propensityScore(mover);
    const nearest = controls
      .map((control) => ({
        mover,
        control,
        scoreGap: Math.abs(moverScore - propensityScore(control)),
        featureGap: distance(mover, control),
      }))
      .sort((a, b) => (a.scoreGap + a.featureGap * 0.25) - (b.scoreGap + b.featureGap * 0.25))[0];
    return nearest;
  }).filter(Boolean);

  const effects = matchedPairs.map(({ mover, control }) => mover.post_revenue_lift - control.post_revenue_lift);
  const ate = effects.reduce((sum, effect) => sum + effect, 0) / effects.length;
  const moverCrunch = treated.filter((row) => row.crunch_month > 0).length / treated.length;
  const controlCrunch = controls.filter((row) => row.crunch_month > 0).length / controls.length;
  const monteCarlo = runMonteCarlo(model, effects, treated);
  const backtest = runBacktest(population);
  const advanced = runAdvancedMlStack(population, treated, controls, matchedPairs, effects, model, backtest);

  return {
    sourceRows: rows.length,
    cohortRows: population.length,
    treatedRows: treated.length,
    controlRows: controls.length,
    matchedRows: matchedPairs.length,
    ate,
    effectLo: percentile(effects, 5),
    effectHi: percentile(effects, 95),
    doublyRobust: ate + (mean(treated.map((row) => row.post_revenue_lift)) - mean(matchedPairs.map((pair) => pair.mover.post_revenue_lift))) * 0.15,
    moverCrunch,
    controlCrunch,
    monteCarlo,
    backtest,
    advanced,
    status: "ready",
  };
}

function emptyEngine(totalRows, type) {
  return {
    sourceRows: totalRows,
    cohortRows: 0,
    treatedRows: 0,
    controlRows: 0,
    matchedRows: 0,
    ate: 0,
    effectLo: 0,
    effectHi: 0,
    doublyRobust: 0,
    moverCrunch: 0,
    controlCrunch: 0,
    monteCarlo: { crunchProbability: 0, liftP5: 0, liftP50: 0, liftP95: 0, runwayP50: 0, downsideMonth: "n/a" },
    backtest: { mape: 0, coverage: 0, holdout: 0 },
    advanced: emptyAdvancedStack(),
    status: `Need at least 10 treated and 10 control rows for ${type}.`,
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runMonteCarlo(model, effects, treatedRows) {
  const runs = 2500;
  const minCash = [];
  const lifts = [];
  const runway = [];
  const crunchMonths = [];
  const observedCash = treatedRows.map((row) => row.post_cash_min).filter(Boolean);

  for (let i = 0; i < runs; i += 1) {
    const effect = effects[(i * 37) % effects.length] || 0;
    const cashPrior = observedCash[(i * 53) % observedCash.length] || BUSINESS.cash * 0.55;
    const lift = model.median + effect * 0.45 + (((i * 97) % 100) - 50) / 18;
    const simulatedMinCash = Math.round(BUSINESS.cash + cashPrior * 0.18 - Math.max(0, model.addedCost) * 2.7 + lift * 900);
    const simulatedRunway = simulatedMinCash / Math.max(1, BUSINESS.burn + Math.max(0, model.addedCost));
    minCash.push(simulatedMinCash);
    lifts.push(lift);
    runway.push(simulatedRunway);
    if (simulatedMinCash < BUSINESS.cash * 0.55) crunchMonths.push(2 + (i % 4));
  }

  return {
    crunchProbability: crunchMonths.length / runs,
    liftP5: percentile(lifts, 5),
    liftP50: percentile(lifts, 50),
    liftP95: percentile(lifts, 95),
    runwayP50: percentile(runway, 50),
    cashP5: percentile(minCash, 5),
    cashP50: percentile(minCash, 50),
    downsideMonth: crunchMonths.length ? `M${Math.round(mean(crunchMonths))}` : "none",
  };
}

function runBacktest(rows) {
  const holdout = rows.filter((_, index) => index % 5 === 0);
  const train = rows.filter((_, index) => index % 5 !== 0);
  const errors = holdout.map((row) => {
    const neighbors = train
      .map((candidate) => ({ candidate, gap: distance(row, candidate) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 20)
      .map(({ candidate }) => candidate.post_revenue_lift);
    const predicted = mean(neighbors);
    return Math.abs((predicted - row.post_revenue_lift) / Math.max(1, Math.abs(row.post_revenue_lift)));
  });
  const mape = mean(errors) * 100;
  const coverage = errors.filter((error) => error <= 0.18).length / Math.max(1, errors.length);
  return { mape, coverage, holdout: holdout.length };
}

function emptyAdvancedStack() {
  return {
    router: [],
    embedding: { anomalyScore: 0, nearestDistance: 0, label: "No cohort" },
    bayesianNetwork: [],
    correlatedMonteCarlo: { crunchProbability: 0, liftP50: 0, cashP50: 0, debtStressP90: 0 },
    optimization: [],
    offPolicy: [],
    bandit: { action: "n/a", expectedReward: 0, confidenceBonus: 0 },
    foundationForecast: [],
    calibration: { method: "Confidence check", confidence: "No confidence", calibratedCoverage: 0 },
    sensitivity: [],
  };
}

function runAdvancedMlStack(population, treated, controls, matchedPairs, effects, model, backtest) {
  const embedding = runRepresentationLearning(population, model);
  const bayesianNetwork = runBayesianNetwork(model, treated);
  const correlatedMonteCarlo = runCorrelatedMonteCarlo(model, treated, effects);
  const optimization = optimizeScenarios(model, effects);
  const offPolicy = runOffPolicyEvaluation(population);
  const bandit = runContextualBandit(optimization, embedding);
  const foundationForecast = runTimeSeriesFoundationForecast(model);
  const calibration = runCalibrationLayer(backtest, embedding);
  const sensitivity = runSensitivityAnalysis(model, effects);
  const router = routeModelTools(model, embedding, matchedPairs.length, backtest);

  return {
    router,
    embedding,
    bayesianNetwork,
    correlatedMonteCarlo,
    optimization,
    offPolicy,
    bandit,
    foundationForecast,
    calibration,
    sensitivity,
  };
}

function rowEmbedding(row) {
  const base = featuresFor(row);
  return [
    base[0] * 1.8 + base[3] * 0.3,
    Math.log1p(base[1]) * 0.9,
    Math.sqrt(Math.max(0, base[2])) * 0.7,
    Math.sin(base[4] * Math.PI) * 0.5 + base[3],
    base[0] * base[1],
  ];
}

function vectorDistance(a, b) {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

function runRepresentationLearning(rows, model) {
  const target = rowEmbedding({
    revenue_slope: 0.081,
    cash_ratio: BUSINESS.cash / BUSINESS.burn,
    employees: BUSINESS.employees,
    margin: 0.24,
    seasonality: 0.62,
  });
  const distances = rows.map((row) => vectorDistance(rowEmbedding(row), target));
  const nearestDistance = percentile(distances, 5);
  const medianDistance = percentile(distances, 50);
  const anomalyScore = Math.min(1, nearestDistance / Math.max(0.01, medianDistance));
  return {
    anomalyScore,
    nearestDistance,
    label: anomalyScore > 0.72 || model.signal.strength === "Inferred" ? "unusual business; widen the confidence range" : "strong match to similar businesses",
  };
}

function runBayesianNetwork(model, treated) {
  const baseCrunch = treated.filter((row) => row.crunch_month > 0).length / Math.max(1, treated.length);
  const hirePressure = model.type === "hire" ? Math.min(0.45, model.count * 0.08) : 0.04;
  const debtPressure = model.type === "capital" ? 0.18 : model.type === "expansion" ? 0.22 : 0.06;
  const capacityGain = model.type === "hire" || model.type === "service" ? 0.28 : model.type === "pricing" ? 0.1 : 0.04;
  const revenueGain = Math.max(0.03, model.median / 100 + capacityGain * 0.35);
  return [
    ["Hiring -> capacity", capacityGain],
    ["Capacity -> revenue", revenueGain],
    ["Payroll -> cash pressure", hirePressure],
    ["Debt service -> cash pressure", debtPressure],
    ["Cash pressure -> churn/crunch", Math.min(0.82, baseCrunch + hirePressure + debtPressure - revenueGain * 0.35)],
  ];
}

function covariance(rows) {
  const triples = rows.map((row) => [
    row.post_revenue_lift,
    row.post_cash_min / 1000,
    Math.max(0, 6 - row.cash_ratio) * 8 + (row.crunch_month > 0 ? 12 : 0),
  ]);
  const means = [0, 1, 2].map((index) => mean(triples.map((triple) => triple[index])));
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => mean(triples.map((triple) => (triple[i] - means[i]) * (triple[j] - means[j])))));
}

function runCorrelatedMonteCarlo(model, treatedRows, effects) {
  const cov = covariance(treatedRows);
  const lift = [];
  const cash = [];
  const debtStress = [];
  for (let i = 0; i < 2500; i += 1) {
    const z1 = (((i * 17) % 100) - 50) / 50;
    const z2 = (((i * 43) % 100) - 50) / 50;
    const z3 = (((i * 71) % 100) - 50) / 50;
    const correlatedLift = model.median + (effects[i % effects.length] || 0) * 0.35 + z1 * Math.sqrt(Math.abs(cov[0][0] || 1));
    const correlatedCash = BUSINESS.cash + z1 * (cov[0][1] || 0) * 120 + z2 * Math.sqrt(Math.abs(cov[1][1] || 1)) * 900 - Math.max(0, model.addedCost) * 2.4;
    const stress = Math.max(0, model.addedCost / 1000 + z2 * (cov[1][2] || 0) * 0.05 + z3 * Math.sqrt(Math.abs(cov[2][2] || 1)));
    lift.push(correlatedLift);
    cash.push(correlatedCash);
    debtStress.push(stress);
  }
  return {
    crunchProbability: cash.filter((value) => value < BUSINESS.cash * 0.55).length / cash.length,
    liftP50: percentile(lift, 50),
    cashP50: percentile(cash, 50),
    debtStressP90: percentile(debtStress, 90),
  };
}

function optimizeScenarios(model, effects) {
  const baseEffect = mean(effects);
  const options = [
    ["Act now", 0, 1, 0],
    ["Wait 6 weeks", -1.2, 0.72, -0.08],
    ["One now, one later", -0.6, 0.64, -0.12],
    ["Take $40K line first", -0.2, 0.48, -0.18],
  ];
  return options
    .map(([action, growthPenalty, crunchMultiplier, riskOffset]) => {
      const expectedGrowth = model.median + baseEffect * 0.35 + growthPenalty;
      const crunchRisk = Math.max(0.02, Math.min(0.85, (model.crunch / 100) * crunchMultiplier + riskOffset));
      const utility = expectedGrowth - crunchRisk * 18;
      return { action, expectedGrowth, crunchRisk, utility };
    })
    .sort((a, b) => b.utility - a.utility);
}

function runOffPolicyEvaluation(rows) {
  const policies = [
    ["Aggressive growth", (row) => row.cash_ratio > 2.2 && row.revenue_slope > 0.06],
    ["Cash-first", (row) => row.cash_ratio > 4.0],
    ["Cohort-safe", (row) => row.margin > 0.2 && row.cash_ratio > 3.0],
  ];
  return policies.map(([name, policy]) => {
    const selected = rows.filter(policy);
    const reward = mean(selected.map((row) => row.post_revenue_lift - (row.crunch_month > 0 ? 8 : 0)));
    return { name, coverage: selected.length / Math.max(1, rows.length), reward };
  }).sort((a, b) => b.reward - a.reward);
}

function runContextualBandit(options, embedding) {
  const ranked = options.map((option, index) => {
    const confidenceBonus = (1 / Math.sqrt(index + 2)) * (1 - Math.min(0.8, embedding.anomalyScore));
    return { ...option, confidenceBonus, banditScore: option.utility + confidenceBonus };
  }).sort((a, b) => b.banditScore - a.banditScore)[0];
  return {
    action: ranked?.action || "n/a",
    expectedReward: ranked?.utility || 0,
    confidenceBonus: ranked?.confidenceBonus || 0,
  };
}

function runTimeSeriesFoundationForecast(model) {
  const trend = model.type === "expansion" ? -0.012 : model.type === "pricing" ? 0.01 : 0.006;
  return Array.from({ length: 8 }, (_, index) => ({
    month: `M${index + 1}`,
    base: Math.round(BUSINESS.trailingRev / 12 * (1 + trend * index)),
    withDecision: Math.round(BUSINESS.trailingRev / 12 * (1 + trend * index + (model.median / 100) * Math.min(1, index / 6))),
  }));
}

function runCalibrationLayer(backtest, embedding) {
  const calibratedCoverage = Math.max(0.5, Math.min(0.98, backtest.coverage - embedding.anomalyScore * 0.08));
  return {
    method: "Confidence check",
    confidence: calibratedCoverage > 0.78 ? "High confidence" : calibratedCoverage > 0.62 ? "Medium confidence" : "Low confidence",
    calibratedCoverage,
  };
}

function runSensitivityAnalysis(model, effects) {
  const effectVol = percentile(effects, 90) - percentile(effects, 10);
  return [
    ["Revenue ramp", Math.abs(model.median) * 0.42 + effectVol * 0.18],
    ["Payroll cost", Math.max(0, model.addedCost / 1000) * 0.38],
    ["Cash buffer", Math.max(0, 6 - BUSINESS.cash / BUSINESS.burn) * 7],
    ["Cohort variance", effectVol * 0.52],
    ["Debt service", model.type === "capital" ? 19 : model.type === "expansion" ? 14 : 5],
  ].sort((a, b) => b[1] - a[1]);
}

function routeModelTools(model, embedding, matchedRows, backtest) {
  const tools = [
    ["Understands your question", "Turns plain English into a decision, timing, amount, and signal check", true],
    ["Finds businesses like yours", "Looks for similar businesses across cash, growth, team size, margin, and seasonality", true],
    ["Builds the comparison group", `${matchedRows.toLocaleString()} mover-control pairs`, matchedRows > 0],
    ["Removes momentum bias", "Separates the decision effect from growth that was already happening", matchedRows > 20],
    ["Rehearses thousands of futures", "Turns peer outcomes into ledger-specific probability ranges", true],
    ["Checks confidence honestly", `Coverage ${(backtest.coverage * 100).toFixed(0)}% on held-out businesses`, backtest.holdout > 20],
    ["Explains the why", "Shows the path from decision to capacity, revenue, cash pressure, and crunch risk", true],
    ["Finds the safest plan", "Chooses the best action under a cash-crunch limit", true],
    ["Tests policies historically", "Checks how recommendation strategies would have performed in past cohorts", true],
    ["Learns which action wins", "Ranks actions for this business context as more outcomes arrive", model.signal.strength !== "Unsupported"],
    ["Flags unusual businesses", embedding.label, embedding.anomalyScore > 0.55],
    ["Forecasts the baseline", "Projects the ledger path before applying the decision effect", true],
    ["Shows what matters most", "Ranks the assumptions driving the recommendation", true],
  ];
  return tools.map(([name, reason, selected]) => ({ name, reason, selected }));
}

export default function App() {
  const [query, setQuery] = useState("Should I hire 2 people in Q3?");
  const [timing] = useState("Q3");
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [selected, setSelected] = useState("Should I hire 2 people in Q3?");
  const [stagger, setStagger] = useState(6);
  const [trustOpen, setTrustOpen] = useState(false);
  const [rows, setRows] = useState(() => makeDemoRows());
  const [dataStatus, setDataStatus] = useState("Using generated demo cohort data.");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [destination, setDestination] = useState(null);
  const [vizTab, setVizTab] = useState("core");
  const [toasts, setToasts] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [queue, setQueue] = useState(["Stage hire", "Open $40K line", "Attach Payroll"]);
  const [labTab, setLabTab] = useState("forms");
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [spotlight, setSpotlight] = useState({ x: 75, y: 18 });

  const model = useMemo(() => getDecisionModel(query, timing), [query, timing]);
  const engine = useMemo(() => runDecisionEngine(rows, model), [rows, model]);
  const planning = useMemo(() => assumptionMath(model, assumptions), [model, assumptions]);
  const series = useMemo(() => cashSeries(model, stagger, assumptions), [model, stagger, assumptions]);
  const cohortDist = useMemo(() => distribution(model), [model]);
  const trough = Math.min(...series.map((d) => d.move));
  const stagedTrough = Math.min(...series.map((d) => d.staged));
  const statusTrough = Math.min(...series.map((d) => d.status));
  const runwayBefore = (BUSINESS.cash / BUSINESS.burn).toFixed(1);
  const burnAfter = BUSINESS.burn + Math.max(0, planning.addedMonthlyCost);
  const runwayAfter = (BUSINESS.cash / burnAfter).toFixed(1);

  function run(nextQuery = query) {
    const nextModel = getDecisionModel(nextQuery, timing);
    setRunning(true);
    setRan(false);
    setTrustOpen(false);
    window.setTimeout(() => {
      setRunning(false);
      setRan(!nextModel.unsupported);
      pushToast(nextModel.unsupported ? "No supported signal found" : "Rehearsal complete");
    }, 920);
  }

  function choosePrompt(prompt) {
    setSelected(prompt);
    setQuery(prompt);
    run(prompt);
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedRows = parseUploadedData(text);
      if (!parsedRows.length) throw new Error("No rows found");
      setRows(parsedRows);
      setDataStatus(`Loaded ${parsedRows.length.toLocaleString()} rows from ${file.name}.`);
      setRan(false);
      pushToast("Cohort data loaded");
    } catch {
      setDataStatus(`Could not parse file. Expected CSV/JSON with: ${DATA_SCHEMA}.`);
    }
  }

  function pushToast(message) {
    const id = Date.now();
    setToasts((current) => [...current.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
  }

  return (
    <main
      className={`${ran ? "app has-result" : "app"} ${darkMode ? "dark-mode" : ""}`}
      style={{ "--spot-x": `${spotlight.x}%`, "--spot-y": `${spotlight.y}%` }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setSpotlight({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        });
      }}
    >
      <style>{styles}</style>
      <header className="topbar">
        <div className="brand">
          <div className="mark">bt</div>
          <div>
            <div className="brand-title">Business Twin</div>
            <div className="brand-sub">Decision intelligence for Intuit Assist</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="theme-toggle" onClick={() => setDarkMode((v) => !v)}>{darkMode ? "Light" : "Dark"}</button>
          <div className="top-meta">GED 2026 prototype · mock data</div>
        </div>
      </header>
      <PullRefreshMock onRefresh={() => pushToast("Cohort refreshed")} />

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">First decision rehearsal engine for small business</div>
          <h1>Rehearse the <span className="kinetic">decision</span> before reality charges you.</h1>
          <p>
            The thing an owner opens the night before a scary decision: hire two people, sign a lease, take a loan, and see whether the business survives before they commit cash.
          </p>
          <StoryPath />
        </div>

        <div className="command-card">
          <Presence />
          <div className="command-label">Ask Business Twin</div>
          <div className="command-row">
            <span className="cmd">⌘K</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRan(false);
                setSelected("");
              }}
              onKeyDown={(event) => event.key === "Enter" && run()}
              placeholder="Should I hire 2 people in Q3?"
            />
            <button onClick={() => run()} disabled={running}>{running ? "Matching..." : "Run"}</button>
          </div>
          <LivePreview model={model} />
          <div className="match-factors">
            {MATCH_FACTORS.map(([label, weight]) => (
              <span key={label}>{label} <b>{weight}</b></span>
            ))}
          </div>
          <div className="data-loader">
            <div>
              <b>Decision engine data</b>
              <span>{dataStatus}</span>
            </div>
            <label>
              Upload CSV/JSON
              <input type="file" accept=".csv,.json,application/json,text/csv" onChange={handleUpload} />
            </label>
          </div>
          <div className="chips">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className={selected === prompt ? "chip active" : "chip"}
                onClick={() => choosePrompt(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <button className="sheet-trigger" onClick={() => setSheetOpen(true)}>Open decision brief</button>
        </div>
      </section>

      <section className="surface-grid reveal">
        <InfoCard
          title="V1 proves hiring. The engine generalizes."
          body="Every major decision maps to ledger impact + cohort retrieval + counterfactual outcome."
        />
        <InfoCard
          title="Twin, not report."
          body="It updates as the business changes, rehearses scenarios, and learns after the owner acts."
        />
        <InfoCard
          title="Not magic. Observable signals."
          body="The Twin only simulates decisions Intuit can observe through Payroll, Books, Payments, Capital, or Tax."
        />
      </section>

      <section className="small-multiples reveal">
        {DECISION_TYPES.map((item) => (
          <div className="mini-card" key={item.key}>
            <div className="mini-head">
              <span>{item.label}</span>
              <b style={{ color: item.color }}>{item.status}</b>
            </div>
            <Spark values={item.mini} color={item.color} />
          </div>
        ))}
      </section>

      {running && <Matching engine={engine} />}

      {model.unsupported && !running && (
        <section className="empty-state reveal">
          <h2>{model.type === "empty" ? "Type a decision to rehearse." : "This decision is outside the v1 signal map."}</h2>
          <p>{model.signal.note}</p>
        </section>
      )}

      {ran && !running && !model.unsupported && (
        <section className="results shared-open">
          <div className="result-header">
            <div>
              <div className="eyebrow">Decision understood</div>
              <h2>{model.decisionLabel}</h2>
              <p>{model.signal.basis}</p>
            </div>
            <Verdict verdict={model.verdict} confidence={model.confidence} />
          </div>

          <div className="kpi-row">
            <Kpi title="Runway" before={`${runwayBefore} mo`} after={`${runwayAfter} mo`} tone={model.verdict === "wait" ? "bad" : "warn"} />
            <Kpi title="Cash trough" before={money(statusTrough)} after={money(trough)} tone={trough < BUSINESS.cash * 0.55 ? "bad" : "good"} />
            <Kpi title="Break-even revenue" before={`${planning.jobsToBreakEven.toFixed(0)} jobs/mo`} after={money(planning.breakEvenRevenue)} tone={planning.netProfitImpact >= 0 ? "good" : "bad"} />
            <Kpi title="Profit target" before={planning.breakEvenStatus} after={money(planning.netProfitImpact)} tone={planning.netProfitImpact >= assumptions.targetProfit ? "good" : "warn"} />
          </div>

          <AssumptionPanel assumptions={assumptions} setAssumptions={setAssumptions} planning={planning} />

          <div className="primary-grid">
            <Card title="Your cash path" subtitle="Time series · ledger simulation">
              <div className="chart tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={LINE} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={money} />
                    <Tooltip formatter={(value) => money(value)} />
                    <ReferenceArea y1={0} y2={BUSINESS.cash * 0.55} fill={RED} fillOpacity={0.07} />
                    <ReferenceLine y={BUSINESS.cash * 0.55} stroke={RED} strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="move" name="Decision path" stroke={model.verdict === "wait" ? RED : QBO} fill={model.verdict === "wait" ? "#D52B1E18" : "#2CA01C18"} strokeWidth={3} />
                    <Line type="monotone" dataKey="staged" name="Staggered / mitigated" stroke={WARN} strokeWidth={2.5} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="status" name="Status quo" stroke={MUTED} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Businesses like you" subtitle="Bar chart · cohort outcomes">
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohortDist} margin={{ top: 12, right: 4, left: -22, bottom: 0 }}>
                    <XAxis dataKey="bucket" tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value) => `${value}% of cohort`} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {cohortDist.map((point) => <Cell key={point.bucket} fill={point.bad ? RED : QBO} opacity={point.bad ? 0.76 : 0.86} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="microcopy">
                Decision lift after comparison: <b>{engine.ate > 0 ? "+" : ""}{engine.ate.toFixed(1)} pts</b>. Momentum-adjusted lift: <b>{engine.doublyRobust > 0 ? "+" : ""}{engine.doublyRobust.toFixed(1)} pts</b>. Cash-crunch rate: <b>{Math.round(engine.moverCrunch * 100)}%</b>.
              </p>
            </Card>

            <Card title="Recommended action" subtitle="Agent can act">
              <ActionCard
                model={model}
                stagger={stagger}
                setStagger={setStagger}
                stagedTrough={stagedTrough}
                trough={trough}
                planning={planning}
                assumptions={assumptions}
                onOpenCapital={() => setDestination("capital")}
                onOpenAttach={() => setDestination("attach")}
              />
            </Card>
          </div>

          <div className="secondary-grid">
            <Card title="Risk heatmap" subtitle="Heatmap · month vs decision intensity">
              <Heatmap />
            </Card>
            <Card title="Future rehearsal" subtitle="2,500 possible paths from similar businesses">
              <EngineStats engine={engine} />
            </Card>
            <Card title="Calibration holdout" subtitle="Predicted vs actual">
              <div className="chart small">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={BACKTEST} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                    <XAxis dataKey="bucket" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="predicted" fill={QBO} radius={[5, 5, 0, 0]} />
                    <Bar dataKey="actual" fill={BLUE} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="microcopy">{engine.backtest.holdout.toLocaleString()} held-out businesses. MAPE <b>{engine.backtest.mape.toFixed(1)}%</b>. Band coverage <b>{Math.round(engine.backtest.coverage * 100)}%</b>.</p>
            </Card>
          </div>

          <MlStackPanel engine={engine} />

          <InteractionStrip
            queue={queue}
            setQueue={setQueue}
            onToast={pushToast}
            onSheet={() => setSheetOpen(true)}
          />

          <ProductSurfaceLab
            activeTab={labTab}
            setActiveTab={setLabTab}
            onToast={pushToast}
          />

          <AdvancedVizGallery rows={rows} engine={engine} model={model} activeTab={vizTab} setActiveTab={setVizTab} />

          <button className="trust-toggle" onClick={() => setTrustOpen((open) => !open)}>
            Why trust this? <span>{trustOpen ? "−" : "+"}</span>
          </button>
          {trustOpen && (
            <div className="trust-panel reveal">
              <InfoCard title="Fair comparison" body="The Twin does not simply say businesses grew after acting. It compares similar businesses that made the move against similar businesses that did not." />
              <InfoCard title="Trust promise" body="Ledger math, peer evidence, and recommended action are always separated. Confidence is never hidden." />
              <InfoCard title="Feedback loop" body="After the owner acts, the Twin tracks actual payroll burn, revenue ramp, and cash trough against the predicted path and updates the mitigation plan." />
              <InfoCard title="Revenue, pruned" body="Premium advisory, QuickBooks Capital, Payroll, Payments, and QBO upgrade/retention. No external cohort data product." />
            </div>
          )}

          <footer className="closer">
            Intuit records what happened. Business Twin rehearses what happens next.
          </footer>
        </section>
      )}

      {sheetOpen && <InsightSheet model={model} engine={engine} onClose={() => setSheetOpen(false)} />}
      {destination && (
        <ProductDestination
          type={destination}
          model={model}
          planning={planning}
          onClose={() => setDestination(null)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </main>
  );
}

function LivePreview({ model }) {
  const signalTone = model.signal.strength === "High" ? QBO : model.signal.strength === "Unsupported" ? RED : WARN;
  return (
    <div className="live-preview">
      <div>
        <span>Decision</span>
        <b>{model.decisionLabel}</b>
      </div>
      <div>
        <span>Signal basis</span>
        <b style={{ color: signalTone }}>{model.signal.strength}</b>
      </div>
      <div className="preview-wide">
        <span>Observed through</span>
        <b>{model.signal.basis}</b>
      </div>
    </div>
  );
}

function Matching({ engine }) {
  const steps = [
    "Understanding decision",
    "Checking observable signal",
    "Reading ledger",
    "Retrieving cohort",
    "Separating controls",
    "Simulating cash path",
  ];
  return (
    <section className="matching shared-open">
      <div className="stream-title">Building the rehearsal</div>
      <div className="step-grid">
        {steps.map((step, index) => (
          <div key={step} className="step" style={{ animationDelay: `${index * 90}ms` }}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{step}</b>
          </div>
        ))}
      </div>
      <p>Building a fair comparison: {engine.treatedRows.toLocaleString()} businesses that made the move against {engine.controlRows.toLocaleString()} similar businesses that did not.</p>
    </section>
  );
}

function Verdict({ verdict, confidence }) {
  const copy = verdict === "wait" ? "Wait" : verdict === "caution" ? "Proceed carefully" : "Go, with mitigation";
  const color = verdict === "wait" ? RED : verdict === "caution" ? WARN : QBO;
  return (
    <div className="verdict" style={{ borderColor: color, color }}>
      <span>{copy}</span>
      <b>{confidence}</b>
    </div>
  );
}

function Kpi({ title, before, after, tone }) {
  const color = tone === "bad" ? RED : tone === "warn" ? WARN : QBO;
  return (
    <div className="kpi">
      <span>{title}</span>
      <div>
        <small>{before}</small>
        <b style={{ color }}>{after}</b>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function InfoCard({ title, body }) {
  return (
    <div className="info-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function EngineStats({ engine }) {
  if (engine.status !== "ready") {
    return <p className="microcopy">{engine.status}</p>;
  }

  const stats = [
    ["Chance of cash crunch", `${Math.round(engine.monteCarlo.crunchProbability * 100)}%`],
    ["Revenue upside band", `${engine.monteCarlo.liftP5.toFixed(1)}% to ${engine.monteCarlo.liftP95.toFixed(1)}%`],
    ["Median runway", `${engine.monteCarlo.runwayP50.toFixed(1)} mo`],
    ["Downside month", engine.monteCarlo.downsideMonth],
  ];

  return (
    <div className="engine-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
      <p className="microcopy">
        The Twin replays similar-business outcomes against this owner’s ledger and reports probability ranges, not a single fake-precise forecast.
      </p>
    </div>
  );
}

function MlStackPanel({ engine }) {
  const stack = engine.advanced || emptyAdvancedStack();
  const selectedTools = stack.router.filter((tool) => tool.selected);
  const sensitivityMax = Math.max(1, ...stack.sensitivity.map(([, value]) => value));

  return (
    <section className="ml-stack">
      <div className="ml-header">
        <div>
          <div className="eyebrow">Decision engine</div>
          <h2>The Twin chooses the right evidence for this decision.</h2>
          <p>The engine turns the owner’s question into a structured scenario, checks whether Intuit has a reliable signal, then chooses the right comparison, rehearsal, confidence, and action-planning tools.</p>
        </div>
        <div className="router-badge">{selectedTools.length}/{stack.router.length} tools active</div>
      </div>

      <div className="tool-grid">
        {stack.router.map((tool) => (
          <div key={tool.name} className={tool.selected ? "tool-card active" : "tool-card"}>
            <b>{tool.name}</b>
            <span>{tool.reason}</span>
          </div>
        ))}
      </div>

      <div className="ml-metrics">
        <div className="ml-card">
          <h3>Similarity and outlier check</h3>
          <Metric label="Closest-match distance" value={stack.embedding.nearestDistance.toFixed(2)} />
          <Metric label="Outlier score" value={`${Math.round(stack.embedding.anomalyScore * 100)}%`} />
          <p>{stack.embedding.label}</p>
        </div>

        <div className="ml-card">
          <h3>Why this happens</h3>
          {stack.bayesianNetwork.map(([edge, probability]) => (
            <Metric key={edge} label={edge} value={`${Math.round(probability * 100)}%`} />
          ))}
        </div>

        <div className="ml-card">
          <h3>Realistic future paths</h3>
          <Metric label="Crunch probability" value={`${Math.round(stack.correlatedMonteCarlo.crunchProbability * 100)}%`} />
          <Metric label="Median lift" value={`${stack.correlatedMonteCarlo.liftP50.toFixed(1)}%`} />
          <Metric label="Median cash" value={money(stack.correlatedMonteCarlo.cashP50)} />
          <Metric label="P90 debt stress" value={stack.correlatedMonteCarlo.debtStressP90.toFixed(1)} />
        </div>

        <div className="ml-card">
          <h3>Best next plan</h3>
          {stack.optimization.slice(0, 4).map((option) => (
            <Metric key={option.action} label={option.action} value={`${option.utility.toFixed(1)} utility`} />
          ))}
          <p>Best action by bandit: <b>{stack.bandit.action}</b></p>
        </div>

        <div className="ml-card">
          <h3>How past playbooks performed</h3>
          {stack.offPolicy.map((policy) => (
            <Metric key={policy.name} label={`${policy.name} (${Math.round(policy.coverage * 100)}% coverage)`} value={`${policy.reward.toFixed(1)} reward`} />
          ))}
        </div>

        <div className="ml-card">
          <h3>Confidence and key drivers</h3>
          <Metric label={stack.calibration.method} value={`${Math.round(stack.calibration.calibratedCoverage * 100)}% coverage`} />
          <Metric label="Confidence label" value={stack.calibration.confidence} />
          <div className="sensitivity-bars">
            {stack.sensitivity.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <i style={{ width: `${Math.max(6, (value / sensitivityMax) * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Card title="Baseline business path" subtitle="what the ledger was already likely to do">
        <div className="chart small">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={stack.foundationForecast} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={money} />
              <Tooltip formatter={(value) => money(value)} />
              <Line type="monotone" dataKey="base" stroke={MUTED} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="withDecision" stroke={QBO} strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function AssumptionPanel({ assumptions, setAssumptions, planning }) {
  const update = (key, value) => setAssumptions((current) => ({ ...current, [key]: value }));
  const sliders = [
    ["targetProfit", "Profit target / mo", 0, 40000, 1000, money(assumptions.targetProfit)],
    ["grossMargin", "Gross margin", 0.15, 0.75, 0.01, `${Math.round(assumptions.grossMargin * 100)}%`],
    ["avgJobValue", "Average job value", 250, 2500, 50, money(assumptions.avgJobValue)],
    ["jobsPerPerson", "Jobs per person / mo", 4, 40, 1, `${assumptions.jobsPerPerson}`],
    ["conversionRate", "Backlog conversion", 0.35, 0.95, 0.01, `${Math.round(assumptions.conversionRate * 100)}%`],
    ["loadedCostPerHire", "Loaded cost per hire / mo", 3000, 14000, 250, money(assumptions.loadedCostPerHire)],
    ["softwareCost", "Software/tools cost / mo", 0, 5000, 100, money(assumptions.softwareCost)],
    ["rampMonths", "Productivity ramp", 1, 8, 1, `${assumptions.rampMonths} mo`],
  ];

  return (
    <section className="assumption-panel">
      <div className="assumption-head">
        <div>
          <div className="eyebrow">Editable baseline assumptions</div>
          <h3>What does this decision need to break even?</h3>
          <p>Adjust profit target, productivity, headcount cost, tools/software, margin, and ramp. The cash path and recommendation update from these levers.</p>
        </div>
        <div className={planning.netProfitImpact >= 0 ? "break-badge good" : "break-badge bad"}>
          <span>{planning.breakEvenStatus}</span>
          <b>{money(planning.netProfitImpact)} / mo</b>
        </div>
      </div>
      <div className="assumption-grid">
        {sliders.map(([key, label, min, max, step, display]) => (
          <label key={key} className="assumption-slider">
            <span>{label}<b>{display}</b></span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={assumptions[key]}
              onChange={(event) => update(key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <div className="break-even-strip">
        <div><span>Revenue needed</span><b>{money(planning.breakEvenRevenue)} / mo</b></div>
        <div><span>Jobs needed</span><b>{planning.jobsToBreakEven.toFixed(1)} / mo</b></div>
        <div><span>Expected gross profit</span><b>{money(planning.expectedGrossProfit)} / mo</b></div>
        <div><span>Added monthly cost</span><b>{money(planning.addedMonthlyCost)} / mo</b></div>
      </div>
    </section>
  );
}

function ActionCard({ model, stagger, setStagger, stagedTrough, trough, planning, assumptions, onOpenCapital, onOpenAttach }) {
  if (model.verdict === "wait") {
    return (
      <div className="action-block danger">
        <h4>Do not sign the lease yet.</h4>
        <p>Wait until cash exceeds $320K or revenue slope holds +12% for two quarters. Set a cash-target alert instead.</p>
        <button>Set $320K cash alert</button>
      </div>
    );
  }

  const cushion = stagedTrough - trough;
  return (
    <div className="action-block">
      <h4>{model.type === "capital" ? "Approve only the responsible amount." : "Stage the risk before you scale it."}</h4>
      <p>{model.signal.note} Based on the current sliders, this decision needs {planning.jobsToBreakEven.toFixed(1)} jobs/month at {money(assumptions.avgJobValue)} average value to cover cost and target profit.</p>
      {(model.type === "hire" || model.type === "service") && model.count > 1 && (
        <div className="spring-slider">
          <div>
            <span>Stage next hire</span>
            <b>{stagger} weeks later</b>
          </div>
          <input type="range" min="2" max="12" step="2" value={stagger} onChange={(event) => setStagger(Number(event.target.value))} />
          <small>Cash cushion improves by {money(Math.max(0, cushion))}</small>
        </div>
      )}
      <button onClick={onOpenCapital}>{model.type === "capital" ? "Open responsible line" : "Open QuickBooks Capital option"}</button>
      <button className="secondary" onClick={onOpenAttach}>Attach Payroll / Payments next step</button>
    </div>
  );
}

function ProductDestination({ type, model, planning, onClose }) {
  const isCapital = type === "capital";
  return (
    <div className="destination-shell">
      <section className="qb-page">
        <aside className="qb-rail">
          <div className="qb-logo">qb</div>
          {["Dashboard", "Banking", "Expenses", "Sales", "Payroll", "Capital", "Reports"].map((item) => (
            <button key={item} className={(isCapital && item === "Capital") || (!isCapital && (item === "Payroll" || item === "Sales")) ? "active" : ""}>{item}</button>
          ))}
        </aside>

        <main className="qb-main">
          <header className="qb-header">
            <button onClick={onClose}>← Back to Business Twin</button>
            <div>
              <span>Riverside HVAC & Plumbing</span>
              <b>Intuit Assist connected</b>
            </div>
          </header>

          {isCapital ? (
            <CapitalPage model={model} planning={planning} />
          ) : (
            <AttachPage model={model} planning={planning} />
          )}
        </main>
      </section>
    </div>
  );
}

function CapitalPage({ model, planning }) {
  const recommended = Math.max(25000, Math.min(80000, Math.ceil((planning.addedMonthlyCost * 4.8) / 5000) * 5000));
  return (
    <div className="qb-content">
      <div className="qb-hero-card capital">
        <div>
          <span className="qb-kicker">QuickBooks Capital</span>
          <h2>Your Twin recommends a {money(recommended)} line before {model.decisionLabel.toLowerCase()}.</h2>
          <p>Built from your ledger, payroll assumptions, and similar-business cash troughs. You can adjust the offer before applying.</p>
        </div>
        <div className="offer-card">
          <span>Recommended line</span>
          <b>{money(recommended)}</b>
          <small>Estimated cushion: {money(Math.max(0, recommended - planning.addedMonthlyCost * 3))}</small>
        </div>
      </div>

      <div className="qb-grid">
        <div className="qb-panel wide">
          <h3>Why this amount</h3>
          <div className="capital-bars">
            {[
              ["Added monthly cost", planning.addedMonthlyCost, "#F2B84B"],
              ["3 month bridge", planning.addedMonthlyCost * 3, "#236CFF"],
              ["Recommended line", recommended, "#2CA01C"],
            ].map(([label, value, color]) => (
              <div key={label}>
                <span>{label}</span>
                <i style={{ width: `${Math.min(100, value / recommended * 100)}%`, background: color }} />
                <b>{money(value)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="qb-panel">
          <h3>Application steps</h3>
          {["Confirm business details", "Review estimated terms", "Submit application"].map((step, index) => (
            <div className="qb-step" key={step}><b>{index + 1}</b>{step}</div>
          ))}
        </div>
        <div className="qb-panel">
          <h3>Twin guardrail</h3>
          <p>Offer is capped against the decision’s break-even need and cash crunch risk, not maximized for loan size.</p>
          <button>Continue to application</button>
        </div>
      </div>
    </div>
  );
}

function AttachPage({ model, planning }) {
  const payrollFirst = model.type === "hire" || model.type === "service" || model.type === "payroll";
  return (
    <div className="qb-content">
      <div className="qb-hero-card attach">
        <div>
          <span className="qb-kicker">Next best action</span>
          <h2>{payrollFirst ? "Set up Payroll for the staged hire plan." : "Attach Payments to capture the decision upside."}</h2>
          <p>Business Twin carries over the decision context so the product setup starts with the right headcount, timing, and break-even assumptions.</p>
        </div>
        <div className="offer-card">
          <span>Break-even target</span>
          <b>{planning.jobsToBreakEven.toFixed(1)} jobs/mo</b>
          <small>{money(planning.breakEvenRevenue)} revenue needed</small>
        </div>
      </div>

      <div className="qb-grid">
        <div className="qb-panel wide">
          <h3>{payrollFirst ? "Payroll setup" : "Payments setup"}</h3>
          <div className="setup-form">
            <label>Decision context<input value={model.decisionLabel} readOnly /></label>
            <label>Start timing<input value={model.timing} readOnly /></label>
            <label>Monthly budget<input value={money(planning.addedMonthlyCost)} readOnly /></label>
            <label>Profit target<input value={money(planning.netProfitImpact)} readOnly /></label>
          </div>
        </div>
        <div className="qb-panel">
          <h3>What transfers over</h3>
          {["Headcount plan", "Loaded cost", "Ramp assumption", "Break-even target"].map((item) => (
            <div className="qb-check" key={item}>✓ {item}</div>
          ))}
        </div>
        <div className="qb-panel">
          <h3>Ready to attach</h3>
          <p>No re-entry. No generic cross-sell. The attach happens at the exact decision moment.</p>
          <button>{payrollFirst ? "Continue to Payroll" : "Continue to Payments"}</button>
        </div>
      </div>
    </div>
  );
}

function Heatmap() {
  const columns = ["low", "med", "high"];
  return (
    <div className="heatmap">
      <div />
      {RISK_HEAT.map((row) => <b key={row.month}>{row.month}</b>)}
      {columns.map((col) => (
        <div className="heat-row" key={col}>
          <span>{col}</span>
          {RISK_HEAT.map((row) => (
            <div key={`${col}-${row.month}`} style={{ background: riskColor(row[col]), opacity: 0.22 + row[col] / 90 }}>
              {row[col]}%
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AdvancedVizGallery({ rows, engine, model, activeTab, setActiveTab }) {
  const sample = rows.filter((row) => row.decision_type === model.type).slice(0, 90);
  const scatter = sample.length ? sample : rows.slice(0, 90);
  const histogram = buildHistogram(scatter.map((row) => row.post_revenue_lift));
  const treatedLifts = scatter.filter((row) => row.treated).map((row) => row.post_revenue_lift);
  const controlLifts = scatter.filter((row) => !row.treated).map((row) => row.post_revenue_lift);
  const tabs = [
    ["core", "Core Stats"],
    ["flows", "Flows"],
    ["planning", "Planning"],
    ["signals", "Signals"],
  ];

  return (
    <section className="viz-section">
      <div className="viz-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>
        ))}
        <i style={{ transform: `translateX(${Math.max(0, tabs.findIndex(([key]) => key === activeTab)) * 100}%)` }} />
      </div>

      <div className="viz-gallery">
        {activeTab === "core" && (
          <>
            <VizCard title="Scatter plot" subtitle="cash ratio vs outcome"><ScatterSvg rows={scatter} /></VizCard>
            <VizCard title="Histogram" subtitle="outcome distribution"><HistogramSvg bins={histogram} /></VizCard>
            <VizCard title="Box plot" subtitle="movers vs controls"><BoxPlotSvg treated={treatedLifts} controls={controlLifts} /></VizCard>
            <VizCard title="Dot plot" subtitle="ranked sensitivity"><DotPlotSvg /></VizCard>
          </>
        )}
        {activeTab === "flows" && (
          <>
            <VizCard title="Waterfall" subtitle="cash bridge"><WaterfallSvg model={model} /></VizCard>
            <VizCard title="Sankey" subtitle="cash flow routing"><SankeySvg /></VizCard>
            <VizCard title="Funnel" subtitle="decision evidence pipeline"><FunnelSvg engine={engine} /></VizCard>
            <VizCard title="Marimekko" subtitle="segment size × outcome"><MekkoSvg /></VizCard>
          </>
        )}
        {activeTab === "planning" && (
          <>
            <VizCard title="Gantt" subtitle="decision rollout timing"><GanttSvg /></VizCard>
            <VizCard title="Bump chart" subtitle="risk rank over months"><BumpSvg /></VizCard>
            <VizCard title="Calendar heatmap" subtitle="daily cash pressure"><CalendarSvg /></VizCard>
            <VizCard title="Cohort grid" subtitle="risk by lifecycle month"><CohortGrid /></VizCard>
            <VizCard title="Bullet chart" subtitle="actual vs target runway"><BulletSvg model={model} /></VizCard>
          </>
        )}
        {activeTab === "signals" && (
          <>
            <VizCard title="Radar" subtitle="business health axes"><RadarSvg /></VizCard>
            <VizCard title="Parallel coordinates" subtitle="multi-factor cohort paths"><ParallelSvg rows={scatter.slice(0, 18)} /></VizCard>
            <VizCard title="Slope chart" subtitle="before / after by segment"><SlopeSvg /></VizCard>
            <VizCard title="Regional intensity" subtitle="geo signal proxy"><RegionGrid /></VizCard>
            <VizCard title="Candlestick" subtitle="cash range by month"><CandleSvg /></VizCard>
          </>
        )}
      </div>
    </section>
  );
}

function VizCard({ title, subtitle, children }) {
  return (
    <div className="viz-card">
      <div className="card-head compact">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function buildHistogram(values) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = Math.max(1, (max - min) / 7);
  return Array.from({ length: 7 }, (_, index) => {
    const lo = min + step * index;
    const hi = lo + step;
    return {
      label: `${Math.round(lo)}-${Math.round(hi)}`,
      count: values.filter((value) => value >= lo && (index === 6 ? value <= hi : value < hi)).length,
    };
  });
}

function ScatterSvg({ rows }) {
  const points = rows.map((row) => ({
    x: 14 + Math.min(72, row.cash_ratio * 12),
    y: 82 - Math.max(0, Math.min(70, row.post_revenue_lift + 22)),
    treated: row.treated,
  }));
  return (
    <svg className="mini-viz" viewBox="0 0 100 100">
      <line x1="12" y1="86" x2="92" y2="86" />
      <line x1="12" y1="12" x2="12" y2="86" />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r="2.4" fill={point.treated ? QBO : BLUE} opacity="0.62" />
      ))}
    </svg>
  );
}

function HistogramSvg({ bins }) {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <svg className="mini-viz" viewBox="0 0 100 100">
      {bins.map((bin, index) => {
        const h = (bin.count / max) * 68;
        return <rect key={bin.label} x={12 + index * 12} y={86 - h} width="8" height={h} rx="3" fill={QBO} opacity="0.82" />;
      })}
      <line x1="10" y1="86" x2="94" y2="86" />
    </svg>
  );
}

function BoxPlotSvg({ treated, controls }) {
  const draw = (values, y, color) => {
    const p25 = percentile(values, 25);
    const p50 = percentile(values, 50);
    const p75 = percentile(values, 75);
    const lo = percentile(values, 5);
    const hi = percentile(values, 95);
    const scale = (value) => 110 + Math.max(0, Math.min(210, (value + 25) * 4.2));
    return (
      <g>
        <line x1={scale(lo)} x2={scale(hi)} y1={y} y2={y} stroke={color} strokeWidth="5" strokeLinecap="round" />
        <rect x={scale(p25)} y={y - 20} width={Math.max(12, scale(p75) - scale(p25))} height="40" rx="12" fill={color} opacity="0.22" stroke={color} strokeWidth="3" />
        <line x1={scale(p50)} x2={scale(p50)} y1={y - 26} y2={y + 26} stroke={color} strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  };
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {draw(treated, 72, QBO)}
      {draw(controls, 138, BLUE)}
      <text x="28" y="78">movers</text>
      <text x="28" y="144">controls</text>
      <text x="110" y="188">downside</text>
      <text x="274" y="188">upside</text>
    </svg>
  );
}

function WaterfallSvg({ model }) {
  const values = [
    ["Start", 218],
    ["Rev", 42],
    ["Burn", -40],
    ["Move", -Math.max(0, model.addedCost / 1000)],
    ["End", 218 + 42 - 40 - Math.max(0, model.addedCost / 1000)],
  ];
  let running = 0;
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {values.map(([label, value], index) => {
        if (index > 0 && index < values.length - 1) running += value;
        const display = index === 0 || index === values.length - 1 ? value : running;
        const x = 34 + index * 64;
        const y = 168 - Math.max(18, Math.min(130, display / 2.2));
        const h = Math.max(18, Math.abs(value) / 2.2);
        return (
          <g key={label}>
            <rect x={x} y={value < 0 ? y - h : y} width="34" height={h} rx="9" fill={value < 0 ? RED : QBO} opacity="0.82" />
            <text x={x + 17} y="194" textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FunnelSvg({ engine }) {
  const values = [
    ["Rows", engine.sourceRows],
    ["Type", engine.cohortRows],
    ["Movers", engine.treatedRows],
    ["Pairs", engine.matchedRows],
  ];
  const max = Math.max(1, values[0][1]);
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {values.map(([label, value], index) => {
        const width = 250 * (value / max);
        const x = (360 - width) / 2;
        const y = 34 + index * 42;
        return (
          <g key={label}>
            <rect x={x} y={y} width={width} height="24" rx="12" fill={index === 0 ? BLUE : QBO} opacity={0.36 + index * 0.12} />
            <text x="180" y={y + 17} textAnchor="middle">{label} · {value.toLocaleString()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CohortGrid() {
  const rows = ["Q1", "Q2", "Q3", "Q4"];
  const cols = ["M1", "M2", "M3", "M4", "M5", "M6"];
  return (
    <div className="cohort-grid">
      {rows.map((row, r) => cols.map((col, c) => {
        const value = 18 + r * 7 + c * 5;
        return <div key={`${row}-${col}`} style={{ background: riskColor(value), opacity: 0.24 + value / 120 }}>{c === 0 ? row : ""}</div>;
      }))}
    </div>
  );
}

function SlopeSvg() {
  const rows = [
    ["Low cash", 28, 43, RED],
    ["Stable", 42, 54, WARN],
    ["High cash", 56, 68, QBO],
  ];
  return (
    <svg className="mini-viz" viewBox="0 0 100 100">
      <text x="14" y="14">before</text>
      <text x="72" y="14">after</text>
      {rows.map(([label, a, b, color], index) => (
        <g key={label}>
          <line x1="20" y1={90 - a} x2="80" y2={90 - b} stroke={color} strokeWidth="3" />
          <circle cx="20" cy={90 - a} r="4" fill={color} />
          <circle cx="80" cy={90 - b} r="4" fill={color} />
          <text x="10" y={94 - a}>{index === 0 ? label : ""}</text>
        </g>
      ))}
    </svg>
  );
}

function RegionGrid() {
  const regions = [
    ["CA", 71], ["NV", 48], ["AZ", 54], ["OR", 36], ["WA", 42], ["UT", 61],
  ];
  return (
    <div className="region-grid">
      {regions.map(([region, value]) => (
        <div key={region} style={{ background: riskColor(value), opacity: 0.24 + value / 110 }}>
          <b>{region}</b><span>{value}</span>
        </div>
      ))}
    </div>
  );
}

function BulletSvg({ model }) {
  const actual = model.verdict === "wait" ? 46 : 72;
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      <rect x="42" y="86" width="260" height="40" rx="20" fill={LINE} />
      <rect x="42" y="86" width="92" height="40" rx="20" fill={RED} opacity="0.24" />
      <rect x="134" y="86" width="82" height="40" fill={WARN} opacity="0.32" />
      <rect x="42" y="100" width={actual * 2.6} height="12" rx="6" fill={model.verdict === "wait" ? RED : QBO} />
      <line x1="238" x2="238" y1="68" y2="144" stroke={DEEP} strokeWidth="5" strokeLinecap="round" />
      <text x="42" y="164">runway vs target</text>
      <text x="238" y="60" textAnchor="middle">target</text>
    </svg>
  );
}

function DotPlotSvg() {
  const rows = [["Revenue ramp", 82], ["Cohort variance", 66], ["Payroll cost", 58], ["Cash buffer", 44], ["Debt service", 30]];
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {rows.map(([label, value], i) => (
        <g key={label}>
          <text x="20" y={34 + i * 34}>{label}</text>
          <line x1="150" x2="320" y1={28 + i * 34} y2={28 + i * 34} stroke={LINE} strokeWidth="4" />
          <circle cx={150 + value * 1.7} cy={28 + i * 34} r="8" fill={QBO} />
          <text x="330" y={34 + i * 34}>{value}</text>
        </g>
      ))}
    </svg>
  );
}

function SankeySvg() {
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      <path d="M70 55 C140 55, 165 42, 245 42" stroke={QBO} strokeWidth="24" opacity=".35" fill="none" />
      <path d="M70 105 C145 105, 165 105, 245 105" stroke={BLUE} strokeWidth="18" opacity=".35" fill="none" />
      <path d="M70 155 C140 155, 165 168, 245 168" stroke={WARN} strokeWidth="12" opacity=".45" fill="none" />
      {["Ledger", "Payroll", "Payments"].map((label, i) => <Node key={label} x={18} y={36 + i * 50} label={label} />)}
      {["Revenue", "Cash", "Risk"].map((label, i) => <Node key={label} x={250} y={24 + i * 63} label={label} />)}
    </svg>
  );
}

function Node({ x, y, label }) {
  return (
    <g>
      <rect x={x} y={y} width="82" height="32" rx="10" fill="white" stroke={LINE} />
      <text x={x + 41} y={y + 21} textAnchor="middle">{label}</text>
    </g>
  );
}

function MekkoSvg() {
  const segments = [
    ["HVAC", 0, 96, [["upside", 58, QBO], ["risk", 26, WARN], ["downside", 12, RED]]],
    ["Plumbing", 100, 72, [["upside", 40, QBO], ["risk", 22, WARN], ["downside", 10, RED]]],
    ["Service", 176, 132, [["upside", 80, QBO], ["risk", 36, WARN], ["downside", 16, RED]]],
  ];
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {segments.map(([label, x, w, parts]) => {
        let y = 30;
        return (
          <g key={label}>
            {parts.map(([part, h, color]) => {
              const rect = <rect key={part} x={24 + x} y={y} width={w} height={h} fill={color} opacity=".72" rx="4" />;
              y += h;
              return rect;
            })}
            <text x={24 + x + w / 2} y="190" textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GanttSvg() {
  const rows = [["Secure line", 20, 76, BLUE], ["Hire 1", 82, 54, QBO], ["Ramp capacity", 126, 88, WARN], ["Hire 2", 210, 56, QBO]];
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {["M1", "M2", "M3", "M4", "M5"].map((m, i) => <text key={m} x={112 + i * 45} y="24">{m}</text>)}
      {rows.map(([label, x, w, color], i) => (
        <g key={label}>
          <text x="20" y={58 + i * 36}>{label}</text>
          <rect x={90 + x} y={42 + i * 36} width={w} height="20" rx="10" fill={color} opacity=".76" />
        </g>
      ))}
    </svg>
  );
}

function BumpSvg() {
  const lines = [
    [QBO, [3, 2, 1, 1, 1]],
    [BLUE, [1, 1, 2, 3, 2]],
    [WARN, [2, 3, 3, 2, 3]],
  ];
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {lines.map(([color, ranks], i) => {
        const points = ranks.map((r, idx) => `${50 + idx * 65},${40 + r * 40}`).join(" ");
        return <polyline key={i} points={points} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {["M1", "M2", "M3", "M4", "M5"].map((m, i) => <text key={m} x={42 + i * 65} y="190">{m}</text>)}
    </svg>
  );
}

function CalendarSvg() {
  return (
    <div className="calendar-viz">
      {Array.from({ length: 42 }, (_, i) => {
        const value = (i * 13) % 70;
        return <span key={i} style={{ background: riskColor(value), opacity: 0.18 + value / 100 }} />;
      })}
    </div>
  );
}

function RadarSvg() {
  const pts = [[180, 34], [280, 86], [246, 168], [114, 168], [80, 86]];
  const vals = [0.8, 0.58, 0.72, 0.45, 0.68];
  const center = [180, 112];
  const poly = pts.map(([x, y], i) => `${center[0] + (x - center[0]) * vals[i]},${center[1] + (y - center[1]) * vals[i]}`).join(" ");
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {[1, .66, .33].map((s) => <polygon key={s} points={pts.map(([x, y]) => `${center[0] + (x - center[0]) * s},${center[1] + (y - center[1]) * s}`).join(" ")} fill="none" stroke={LINE} />)}
      <polygon points={poly} fill={`${QBO}44`} stroke={QBO} strokeWidth="4" />
      {["Cash", "Growth", "Margin", "Debt", "Signal"].map((label, i) => <text key={label} x={pts[i][0]} y={pts[i][1]} textAnchor="middle">{label}</text>)}
    </svg>
  );
}

function ParallelSvg({ rows }) {
  const axes = ["slope", "cash", "team", "margin", "outcome"];
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {axes.map((axis, i) => <g key={axis}><line x1={40 + i * 70} x2={40 + i * 70} y1="34" y2="168" stroke={LINE} strokeWidth="3" /><text x={40 + i * 70} y="190" textAnchor="middle">{axis}</text></g>)}
      {rows.map((row, idx) => {
        const values = [row.revenue_slope * 5, row.cash_ratio / 7, row.employees / 20, row.margin, (row.post_revenue_lift + 20) / 60];
        const points = values.map((v, i) => `${40 + i * 70},${168 - Math.max(0, Math.min(1, v)) * 134}`).join(" ");
        return <polyline key={idx} points={points} fill="none" stroke={row.treated ? QBO : BLUE} strokeWidth="2" opacity=".32" />;
      })}
    </svg>
  );
}

function CandleSvg() {
  const candles = [42, 50, 47, 61, 55, 68].map((v, i) => ({ x: 42 + i * 48, low: v - 18, open: v - 6, close: v + 8, high: v + 18 }));
  return (
    <svg className="mini-viz readable" viewBox="0 0 360 210">
      {candles.map((c, i) => (
        <g key={i}>
          <line x1={c.x} x2={c.x} y1={176 - c.high} y2={176 - c.low} stroke={DEEP} strokeWidth="3" />
          <rect x={c.x - 10} y={176 - Math.max(c.open, c.close)} width="20" height={Math.abs(c.close - c.open)} rx="5" fill={c.close > c.open ? QBO : RED} />
        </g>
      ))}
      <text x="24" y="190">cash range</text>
    </svg>
  );
}

function StoryPath() {
  return (
    <svg className="story-path" viewBox="0 0 620 168" aria-hidden="true">
      <defs>
        <linearGradient id="storySafe" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2CA01C" />
          <stop offset="58%" stopColor="#53B7FF" />
          <stop offset="100%" stopColor="#2CA01C" />
        </linearGradient>
        <linearGradient id="storyRisk" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#F2B84B" />
          <stop offset="100%" stopColor="#D52B1E" />
        </linearGradient>
        <filter id="storyGlow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect className="story-band story-band-good" x="28" y="20" width="258" height="92" rx="24" />
      <rect className="story-band story-band-warn" x="342" y="20" width="236" height="92" rx="24" />

      <path className="story-gridline" d="M42 116 H584" />
      <path className="story-shadow" d="M34 98 C108 42, 184 112, 252 78 S360 20, 440 54 S528 134, 588 80" />
      <path className="story-risk-line" d="M350 74 C410 128, 488 130, 580 78" />
      <path className="story-safe-line" d="M34 98 C108 42, 184 112, 252 78 S360 20, 440 54 S528 134, 588 80" />

      <g className="story-node node-one" transform="translate(34 98)">
        <circle r="12" />
        <text x="0" y="-24" textAnchor="middle">Ask</text>
      </g>
      <g className="story-node node-two" transform="translate(252 78)">
        <circle r="12" />
        <text x="0" y="-24" textAnchor="middle">Match</text>
      </g>
      <g className="story-node node-three" transform="translate(440 54)">
        <circle r="12" />
        <text x="0" y="-24" textAnchor="middle">Rehearse</text>
      </g>
      <g className="story-node node-four" transform="translate(588 80)">
        <circle r="12" />
        <text x="0" y="-24" textAnchor="middle">Act</text>
      </g>

      <g className="story-pulse">
        <circle r="7" />
      </g>
      <text className="story-caption" x="44" y="148">ledger math</text>
      <text className="story-caption" x="235" y="148">peer evidence</text>
      <text className="story-caption" x="432" y="148">risk bands</text>
    </svg>
  );
}

function Presence() {
  return (
    <div className="presence">
      <span className="cursor-dot one">CW</span>
      <span className="cursor-dot two">BH</span>
      <b>Brice viewing · Chris editing</b>
    </div>
  );
}

function ProductSurfaceLab({ activeTab, setActiveTab, onToast }) {
  const tabs = [
    ["forms", "Forms"],
    ["nav", "Navigation"],
    ["feedback", "Feedback"],
    ["overlays", "Overlays"],
    ["data", "Data"],
    ["editing", "Editing"],
    ["media", "Media"],
  ];

  return (
    <section className="surface-lab">
      <div className="lab-head">
        <div>
          <div className="eyebrow">Product surface library</div>
          <h2>Production interaction patterns, compressed into the demo.</h2>
        </div>
        <FloatingActionButton onToast={onToast} />
      </div>
      <div className="lab-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>
        ))}
      </div>
      {activeTab === "forms" && <FormsLab onToast={onToast} />}
      {activeTab === "nav" && <NavigationLab />}
      {activeTab === "feedback" && <FeedbackLab />}
      {activeTab === "overlays" && <OverlaysLab onToast={onToast} />}
      {activeTab === "data" && <DataLab onToast={onToast} />}
      {activeTab === "editing" && <EditingLab onToast={onToast} />}
      {activeTab === "media" && <MediaLab />}
    </section>
  );
}

function FormsLab({ onToast }) {
  const [step, setStep] = useState(2);
  const [phone, setPhone] = useState("(916) 555-0148");
  const [tags, setTags] = useState(["Payroll", "Capital"]);
  const [range, setRange] = useState(6);
  const [segment, setSegment] = useState("Q3");
  const [toggle, setToggle] = useState(true);
  const [otp, setOtp] = useState(["2", "0", "2", "6"]);
  const [auto, setAuto] = useState("hire");
  const [rich, setRich] = useState("Owner prefers staged hiring if crunch risk exceeds 25%.");
  const validPhone = phone.replace(/\D/g, "").length === 10;
  const suggestions = { Decisions: ["hire", "raise prices", "open location"], Signals: ["payroll event", "invoice shift", "lease increase"] };

  return (
    <div className="lab-grid forms-grid">
      <div className="lab-card wide">
        <h3>Multi-step wizard</h3>
        <div className="stepper">{["Decision", "Signals", "Simulation", "Action"].map((label, i) => <button key={label} className={i + 1 <= step ? "done" : ""} onClick={() => setStep(i + 1)}>{i + 1}<span>{label}</span></button>)}</div>
        <div className="progress"><i style={{ width: `${step * 25}%` }} /></div>
      </div>
      <div className="lab-card"><h3>Masked input + inline validation</h3><input value={phone} onChange={(event) => setPhone(maskPhone(event.target.value))} /><p className={validPhone ? "ok" : "warn"}>{validPhone ? "Phone format confirmed" : "Enter 10 digits"}</p></div>
      <div className="lab-card"><h3>Tag multi-select</h3><div className="tag-row">{["Payroll", "Capital", "Payments", "Books"].map((tag) => <button key={tag} className={tags.includes(tag) ? "selected" : ""} onClick={() => setTags((current) => current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag])}>{tag}</button>)}</div></div>
      <div className="lab-card"><h3>Range + segmented control</h3><input type="range" min="0" max="12" value={range} onChange={(event) => setRange(event.target.value)} /><p>{range} week delay</p><div className="segmented">{["Q2", "Q3", "Q4"].map((q) => <button key={q} className={segment === q ? "active" : ""} onClick={() => setSegment(q)}>{q}</button>)}</div></div>
      <div className="lab-card"><h3>Toggle + OTP</h3><label className="switch"><input type="checkbox" checked={toggle} onChange={(event) => setToggle(event.target.checked)} /><span /></label><div className="otp">{otp.map((digit, i) => <input key={i} value={digit} maxLength="1" onChange={(event) => setOtp((current) => current.map((d, idx) => idx === i ? event.target.value : d))} />)}</div></div>
      <div className="lab-card"><h3>Grouped autocomplete</h3><input value={auto} onChange={(event) => setAuto(event.target.value)} /><div className="autocomplete">{Object.entries(suggestions).map(([group, items]) => <div key={group}><b>{group}</b>{items.filter((item) => item.includes(auto.toLowerCase()) || !auto).map((item) => <button key={item}>{item}</button>)}</div>)}</div></div>
      <div className="lab-card"><h3>Rich text note</h3><textarea value={rich} onChange={(event) => setRich(event.target.value)} /></div>
      <div className="lab-card dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onToast("Dropped cohort file"); }}><h3>File dropzone</h3><p>Drag CSV/JSON here</p></div>
      <div className="lab-card"><h3>Date range presets</h3><div className="tag-row">{["Last 90 days", "Q3", "FY 2026"].map((preset) => <button key={preset}>{preset}</button>)}</div></div>
    </div>
  );
}

function maskPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6);
  if (digits.length <= 3) return a;
  if (digits.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

function NavigationLab() {
  return (
    <div className="lab-grid">
      <div className="lab-card wide"><h3>Breadcrumbs + mega menu</h3><div className="breadcrumbs">QBO › Intuit Assist › Business Twin › Hiring rehearsal</div><div className="mega-menu">{["Capital", "Payroll", "Payments", "Books"].map((item) => <div key={item}><b>{item}</b><span>Attach surface</span></div>)}</div></div>
      <div className="lab-card"><h3>Collapsible icon rail</h3><div className="icon-rail">{["⌂", "◈", "◐", "✓"].map((icon) => <button key={icon}>{icon}</button>)}</div></div>
      <div className="lab-card"><h3>Bottom nav</h3><div className="bottom-nav">{["Ask", "Twin", "Data", "Act"].map((item) => <button key={item}>{item}</button>)}</div></div>
      <div className="lab-card"><h3>Scroll-spy / TOC</h3><div className="toc">{["Decision", "Evidence", "Simulation", "Action"].map((item, i) => <a key={item} className={i === 1 ? "active" : ""}>{item}</a>)}</div></div>
      <div className="lab-card"><h3>Pagination / load more</h3><div className="pagination"><button>Prev</button><b>2 / 8</b><button>Next</button></div><button className="load-more">Load more cohorts</button></div>
    </div>
  );
}

function FeedbackLab() {
  return (
    <div className="lab-grid">
      <div className="lab-card wide"><h3>Progress bars</h3><div className="progress"><i style={{ width: "72%" }} /></div><div className="indeterminate" /></div>
      <div className="lab-card"><h3>Step tracker</h3><div className="mini-steps"><span className="done" /><span className="done" /><span /><span /></div></div>
      <div className="lab-card empty-mini"><h3>Empty state</h3><p>No pricing cohort yet.</p><button>Add pricing sample</button></div>
      <div className="lab-card"><h3>Banners</h3><p className="banner success">High confidence</p><p className="banner warn">Thin cohort</p><p className="banner error">Unsupported signal</p></div>
      <div className="lab-card"><h3>Badges, dots, tooltip</h3><span className="badge">12</span><span className="status-dot" /> <span className="tooltip">Hover help<i>Confidence is calibrated from holdout coverage.</i></span></div>
    </div>
  );
}

function OverlaysLab({ onToast }) {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [accordion, setAccordion] = useState("matching");
  return (
    <div className="lab-grid">
      <div className="lab-card"><h3>Modal / drawer</h3><button onClick={() => setModal(true)}>Open modal</button><button className="secondary-lab" onClick={() => setDrawer(true)}>Open drawer</button></div>
      <div className="lab-card"><h3>Popover / context menu</h3><button onClick={() => onToast("Context action selected")}>Right-click style action</button><div className="popover">Inline popover: run backtest?</div></div>
      <div className="lab-card wide"><h3>Nested accordion</h3>{["comparison", "confidence", "future paths"].map((item) => <div key={item} className="accordion"><button onClick={() => setAccordion(item)}>{item}</button>{accordion === item && <p>Details for {item} layer expand inline without navigation.</p>}</div>)}</div>
      <div className="lab-card wide"><h3>Split-pane resizable layout</h3><div className="split-pane"><div>Ledger inputs</div><i /><div>Cohort outputs</div></div></div>
      {modal && <div className="mini-modal"><div><h3>Decision confirmation</h3><p>Proceed with staged hiring recommendation?</p><button onClick={() => setModal(false)}>Close</button></div></div>}
      {drawer && <div className="side-drawer"><button onClick={() => setDrawer(false)}>×</button><h3>Evidence drawer</h3><p>Comparison group, assumptions, and confidence notes.</p></div>}
    </div>
  );
}

function DataLab({ onToast }) {
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState([]);
  const rows = [["HVAC", 14, 25], ["Plumbing", 9, 18], ["Service", 12, 34]].sort((a, b) => sortAsc ? a[1] - b[1] : b[1] - a[1]);
  return (
    <div className="lab-grid">
      <div className="lab-card wide"><h3>Sortable/filterable table + bulk bar</h3>{selected.length > 0 && <div className="bulk-bar">{selected.length} selected <button onClick={() => onToast("Bulk action applied")}>Apply action</button></div>}<table><thead><tr><th></th><th>Segment</th><th onClick={() => setSortAsc(!sortAsc)}>Lift ↕</th><th>Crunch</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td><input type="checkbox" checked={selected.includes(r[0])} onChange={() => setSelected((s) => s.includes(r[0]) ? s.filter((x) => x !== r[0]) : [...s, r[0]])} /></td><td>{r[0]}</td><td>{r[1]}%</td><td>{r[2]}%</td></tr>)}</tbody></table></div>
      <div className="lab-card"><h3>Faceted filters</h3><div className="tag-row">{["High confidence", "Payroll", "Q3", "Sacramento"].map((f) => <button key={f}>{f}</button>)}</div></div>
      <div className="lab-card"><h3>Kanban board</h3><div className="kanban">{["To test", "Ready", "Act"].map((col) => <div key={col}><b>{col}</b><span>Hire scenario</span></div>)}</div></div>
      <div className="lab-card"><h3>Tree view</h3><ul className="tree"><li>Business Twin<ul><li>Ledger</li><li>Payroll</li><li>Cohorts</li></ul></li></ul></div>
      <div className="lab-card"><h3>Virtualized list mock</h3><div className="virtual-list">{Array.from({ length: 8 }, (_, i) => <span key={i}>cohort row {i + 248}</span>)}</div></div>
    </div>
  );
}

function EditingLab({ onToast }) {
  const [cell, setCell] = useState("Stage second hire");
  const [history, setHistory] = useState(["Stage second hire"]);
  const copy = () => navigator.clipboard?.writeText(cell).finally(() => onToast("Copied recommendation"));
  return (
    <div className="lab-grid">
      <div className="lab-card"><h3>Inline editing</h3><input value={cell} onChange={(e) => setCell(e.target.value)} onBlur={() => setHistory((h) => [...h, cell])} /></div>
      <div className="lab-card"><h3>Undo / redo history</h3><button onClick={() => setCell(history.at(-2) || cell)}>Undo</button><button onClick={() => setHistory((h) => [...h, cell])}>Save version</button></div>
      <div className="lab-card"><h3>Copy confirmation</h3><button onClick={copy}>Copy recommendation</button></div>
      <div className="lab-card wide"><h3>Bulk edit bar</h3><div className="bulk-bar">3 rows selected <button>Assign confidence</button><button>Export</button></div></div>
    </div>
  );
}

function MediaLab() {
  const [slide, setSlide] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [before, setBefore] = useState(48);
  return (
    <div className="lab-grid">
      <div className="lab-card"><h3>Image carousel</h3><div className="carousel" onClick={() => setSlide((slide + 1) % 3)}><span>{["Cash path", "Cohort", "Action"][slide]}</span></div></div>
      <div className="lab-card"><h3>Lightbox</h3><button onClick={() => setLightbox(true)}>Open gallery</button></div>
      <div className="lab-card wide"><h3>Before / after slider</h3><div className="before-after"><div style={{ width: `${before}%` }}>Before</div><span style={{ left: `${before}%` }} /><b>After</b></div><input type="range" value={before} min="10" max="90" onChange={(e) => setBefore(e.target.value)} /></div>
      <div className="lab-card"><h3>Zoom / pan viewer</h3><div className="zoom-view">Cohort map</div></div>
      <div className="lab-card"><h3>Avatar group</h3><div className="avatars"><span>CW</span><span>BH</span><span>AI</span><b>+8</b></div></div>
      {lightbox && <div className="mini-modal"><div><h3>Evidence gallery</h3><div className="carousel large"><span>Similar-business snapshot</span></div><button onClick={() => setLightbox(false)}>Close</button></div></div>}
    </div>
  );
}

function FloatingActionButton({ onToast }) {
  return <button className="fab" onClick={() => onToast("New scenario started")}>+</button>;
}

function PullRefreshMock({ onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 900);
  };

  return (
    <button className={refreshing ? "pull-refresh refreshing" : "pull-refresh"} onClick={refresh}>
      <span />
      {refreshing ? "Refreshing cohort..." : "Refresh cohort"}
    </button>
  );
}

function InteractionStrip({ queue, setQueue, onToast, onSheet }) {
  const [radialOpen, setRadialOpen] = useState(false);
  const moveFirst = () => {
    setQueue((items) => [items[1], items[0], ...items.slice(2)]);
    onToast("Recommendation queue reordered");
  };
  return (
    <section className="interaction-strip">
      <div className="radial-wrap">
        <button className="radial-main" onClick={() => setRadialOpen((v) => !v)}>Actions</button>
        {radialOpen && (
          <div className="radial-menu">
            <button onClick={onSheet}>Brief</button>
            <button onClick={() => onToast("Scenario saved")}>Save</button>
            <button onClick={() => onToast("Shared with advisor")}>Share</button>
          </div>
        )}
      </div>
      <div className="reorder-card">
        <b>Drag-to-reorder mock</b>
        <div>
          {queue.map((item, index) => (
            <button key={item} onClick={index === 1 ? moveFirst : undefined}>{item}</button>
          ))}
        </div>
      </div>
      <button className="success-button" onClick={() => onToast("Milestone complete")}>Mark rehearsal ready <Confetti /></button>
    </section>
  );
}

function Confetti() {
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
    </span>
  );
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button key={toast.id} className="toast" onClick={() => onDismiss(toast.id)}>
          {toast.message}
          <span>dismiss</span>
        </button>
      ))}
    </div>
  );
}

function InsightSheet({ model, engine, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="insight-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="card-head">
          <h3>Decision brief</h3>
          <button onClick={onClose}>Done</button>
        </div>
        <div className="brief-grid">
          <Kpi title="Decision" before={model.type} after={model.decisionLabel} tone="good" />
          <Kpi title="ATE" before="matched pairs" after={`${engine.ate.toFixed(1)} pts`} tone={engine.ate < 0 ? "bad" : "good"} />
          <Kpi title="Crunch risk" before="future rehearsal" after={`${Math.round(engine.monteCarlo.crunchProbability * 100)}%`} tone={engine.monteCarlo.crunchProbability > 0.35 ? "bad" : "good"} />
        </div>
        <p className="microcopy">This sheet mimics the mobile gesture layer: a fast, focused brief after the full model finishes running.</p>
      </section>
    </div>
  );
}

function Spark({ values, color }) {
  const points = values.map((value, index) => `${index * 18},${70 - value}`).join(" ");
  return (
    <svg viewBox="0 0 90 42" className="spark" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BG}; color: ${INK}; }
  .app {
    min-height: 100vh;
    font-family: Avenir Next, Avenir, Helvetica Neue, Helvetica, Arial, sans-serif;
    padding: 0 24px 64px;
    background:
      radial-gradient(520px circle at var(--spot-x) var(--spot-y), #2CA01C18 0%, transparent 42%),
      radial-gradient(900px 420px at 80% -10%, #DFF7E6 0%, transparent 70%),
      linear-gradient(180deg, #FFFFFF 0%, ${BG} 52%);
  }
  .topbar {
    max-width: 1180px;
    height: 72px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand { display: flex; gap: 12px; align-items: center; }
  .mark {
    width: 40px; height: 40px; border-radius: 14px;
    display: grid; place-items: center;
    background: ${QBO}; color: white; font-weight: 800; letter-spacing: -.04em;
  }
  .brand-title { font-size: 16px; font-weight: 800; }
  .brand-sub, .top-meta { color: ${MUTED}; font-size: 12px; }
  .top-actions { display: flex; align-items: center; gap: 12px; }
  .theme-toggle {
    background: white;
    color: ${DEEP};
    border: 1px solid ${LINE};
    padding: 8px 12px;
  }
  .dark-mode {
    background:
      radial-gradient(520px circle at var(--spot-x) var(--spot-y), #53E07C22 0%, transparent 42%),
      linear-gradient(180deg, #071713 0%, #10241E 100%);
    color: white;
  }
  .dark-mode h1, .dark-mode h2, .dark-mode .brand-title { color: white; }
  .dark-mode .command-card, .dark-mode .card, .dark-mode .info-card, .dark-mode .mini-card, .dark-mode .viz-card, .dark-mode .kpi {
    background: #10241E;
    border-color: #FFFFFF22;
    color: white;
  }
  .dark-mode .card h3, .dark-mode .info-card h3, .dark-mode .viz-card h3, .dark-mode .kpi b { color: white; }
  .dark-mode .hero-copy p,
  .dark-mode .brand-sub,
  .dark-mode .top-meta,
  .dark-mode .microcopy,
  .dark-mode .live-preview span,
  .dark-mode .card-head span,
  .dark-mode .kpi span,
  .dark-mode .lab-card p,
  .dark-mode .metric span {
    color: #B9CBC3;
  }
  .dark-mode input,
  .dark-mode textarea,
  .dark-mode .command-row,
  .dark-mode .live-preview div,
  .dark-mode .match-factors span,
  .dark-mode .data-loader,
  .dark-mode .viz-section,
  .dark-mode .viz-tabs,
  .dark-mode .surface-lab,
  .dark-mode .lab-card,
  .dark-mode .mega-menu div,
  .dark-mode .kanban div,
  .dark-mode .split-pane div,
  .dark-mode .virtual-list span,
  .dark-mode .popover,
  .dark-mode .reorder-card,
  .dark-mode .radial-wrap,
  .dark-mode .pull-refresh {
    background: #0D1D18;
    border-color: #FFFFFF26;
    color: #F4FFF8;
  }
  .dark-mode .lab-card h3,
  .dark-mode .lab-head h2,
  .dark-mode .tool-card b,
  .dark-mode .metric b,
  .dark-mode .autocomplete b,
  .dark-mode .tree,
  .dark-mode .accordion button {
    color: #F4FFF8;
  }
  .dark-mode .theme-toggle,
  .dark-mode .chip,
  .dark-mode .tag-row button,
  .dark-mode .segmented button,
  .dark-mode .bottom-nav button,
  .dark-mode .pagination button,
  .dark-mode .load-more,
  .dark-mode .secondary-lab,
  .dark-mode .reorder-card button,
  .dark-mode .autocomplete button {
    background: #17332A;
    border-color: #FFFFFF26;
    color: #F4FFF8;
  }
  .dark-mode .mini-viz text,
  .dark-mode .mini-viz.readable text {
    fill: #D8EAE1;
  }
  .dark-mode .mini-viz line {
    stroke: #355247;
  }
  .dark-mode .mini-viz [stroke="#DDE7E1"] {
    stroke: #355247;
  }
  .pull-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 auto 10px;
    padding: 8px 12px;
    width: fit-content;
    background: white;
    color: ${QBO};
    border: 1px solid ${LINE};
    border-radius: 999px;
    font-size: 12px;
    box-shadow: none;
  }
  .pull-refresh span {
    width: 16px;
    height: 16px;
    border: 3px solid #DDF2E1;
    border-top-color: ${QBO};
    border-radius: 999px;
  }
  .pull-refresh.refreshing span { animation: spin .8s linear infinite; }
  .hero {
    max-width: 1180px;
    min-height: 420px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 520px;
    gap: 48px;
    align-items: center;
  }
  .eyebrow {
    color: ${QBO};
    font-size: 12px;
    line-height: 16px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 12px 0 16px;
    max-width: 620px;
    font-size: 44px;
    line-height: 52px;
    letter-spacing: -0.04em;
    color: ${DEEP};
  }
  .kinetic {
    display: inline-block;
    color: ${QBO};
    animation: kinetic 3.2s ease-in-out infinite;
    transform-origin: 50% 70%;
  }
  .hero-copy p {
    max-width: 620px;
    color: ${MUTED};
    font-size: 17px;
    line-height: 27px;
    margin: 0;
  }
  .command-card {
    background: ${SURFACE};
    border: 1px solid ${LINE};
    border-radius: 28px;
    padding: 24px;
    box-shadow: 0 24px 70px #0B1F1A14;
    transition: transform 460ms cubic-bezier(.2,.9,.2,1), box-shadow 460ms ease;
  }
  .presence {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    min-height: 20px;
    margin-bottom: 8px;
    color: ${MUTED};
    font-size: 11px;
  }
  .cursor-dot {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: white;
    font-size: 9px;
    font-weight: 900;
    box-shadow: 0 6px 14px #0B1F1A24;
    animation: cursorFloat 4s ease-in-out infinite;
  }
  .cursor-dot.one { background: ${QBO}; }
  .cursor-dot.two { background: ${BLUE}; animation-delay: -1.5s; }
  .has-result .command-card { transform: translateY(-8px) scale(.985); box-shadow: 0 14px 44px #0B1F1A10; }
  .command-label {
    color: ${MUTED};
    font-size: 12px;
    line-height: 16px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 12px;
  }
  .command-row {
    display: grid;
    grid-template-columns: 44px 1fr 86px;
    gap: 8px;
    align-items: center;
    border: 1px solid ${LINE};
    border-radius: 18px;
    padding: 8px;
    background: #FBFCFB;
  }
  .cmd {
    height: 36px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: ${DEEP};
    color: white;
    font-size: 13px;
    font-weight: 800;
  }
  input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: ${INK};
    font-size: 15px;
  }
  button {
    border: 0;
    border-radius: 14px;
    background: ${QBO};
    color: white;
    font-weight: 800;
    cursor: pointer;
    transition: transform 180ms cubic-bezier(.2,.9,.2,1), box-shadow 180ms ease, background 180ms ease;
  }
  button:hover { transform: translateY(-1px) scale(1.015); box-shadow: 0 10px 24px #2CA01C2B; }
  .command-row button { height: 36px; }
  .live-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .live-preview div {
    padding: 12px;
    border-radius: 14px;
    background: ${BG};
    border: 1px solid ${LINE};
  }
  .live-preview .preview-wide { grid-column: 1 / -1; }
  .live-preview span, .kpi span, .card-head span {
    display: block;
    color: ${MUTED};
    font-size: 12px;
    line-height: 16px;
  }
  .live-preview b { display: block; margin-top: 3px; font-size: 13px; line-height: 18px; }
  .match-factors {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .match-factors span {
    border: 1px solid ${LINE};
    border-radius: 999px;
    padding: 5px 8px;
    color: ${MUTED};
    font-size: 11px;
    background: white;
  }
  .match-factors b { color: ${QBO}; }
  .data-loader {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-top: 12px;
    padding: 12px;
    border-radius: 16px;
    background: #F3F7F4;
    border: 1px dashed ${QBO};
  }
  .data-loader b {
    display: block;
    color: ${DEEP};
    font-size: 12px;
  }
  .data-loader span {
    display: block;
    color: ${MUTED};
    font-size: 11px;
    margin-top: 2px;
  }
  .data-loader label {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: white;
    border: 1px solid ${QBO};
    color: ${QBO};
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }
  .data-loader input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .chip {
    background: #FFFFFF;
    color: ${INK};
    border: 1px solid ${LINE};
    padding: 8px 10px;
    font-size: 12px;
    box-shadow: none;
  }
  .chip.active { color: ${QBO}; border-color: ${QBO}; background: #F0FBF2; }
  .sheet-trigger {
    width: 100%;
    margin-top: 12px;
    min-height: 40px;
    background: ${DEEP};
  }
  .story-path {
    width: min(620px, 100%);
    height: 168px;
    margin-top: 30px;
    overflow: visible;
  }
  .story-band {
    opacity: 0;
    animation: bandIn .7s ease forwards;
    animation-delay: .25s;
  }
  .story-band-good {
    fill: #2CA01C10;
    stroke: #2CA01C22;
  }
  .story-band-warn {
    fill: #F2B84B14;
    stroke: #F2B84B2F;
    animation-delay: .42s;
  }
  .story-gridline {
    fill: none;
    stroke: #DDE7E1;
    stroke-width: 2;
    stroke-dasharray: 6 8;
  }
  .story-safe-line,
  .story-risk-line,
  .story-shadow {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 620;
    stroke-dashoffset: 620;
    animation: drawPath 2s cubic-bezier(.2,.9,.2,1) forwards;
  }
  .story-shadow {
    stroke: #0B1F1A16;
    stroke-width: 18;
    filter: url(#storyGlow);
  }
  .story-safe-line {
    stroke: url(#storySafe);
    stroke-width: 7;
    filter: url(#storyGlow);
  }
  .story-risk-line {
    stroke: url(#storyRisk);
    stroke-width: 4;
    stroke-dasharray: 7 10;
    animation-delay: .55s;
    opacity: .9;
  }
  .story-node circle {
    fill: white;
    stroke: ${QBO};
    stroke-width: 5;
    opacity: 0;
    animation: dotIn .4s ease forwards;
    animation-delay: 1.4s;
  }
  .story-node text,
  .story-caption {
    fill: ${MUTED};
    font-size: 13px;
    font-weight: 900;
    letter-spacing: .02em;
    opacity: 0;
    animation: dotIn .4s ease forwards;
    animation-delay: 1.55s;
  }
  .story-caption {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .09em;
  }
  .node-two circle { animation-delay: 1.62s; }
  .node-three circle { animation-delay: 1.84s; stroke: ${BLUE}; }
  .node-four circle { animation-delay: 2.05s; }
  .story-pulse {
    offset-path: path("M34 98 C108 42, 184 112, 252 78 S360 20, 440 54 S528 134, 588 80");
    animation: travelPath 4.2s cubic-bezier(.2,.9,.2,1) infinite;
    filter: url(#storyGlow);
  }
  .story-pulse circle {
    fill: ${QBO};
    stroke: white;
    stroke-width: 4;
  }
  .dark-mode .story-gridline { stroke: #355247; }
  .dark-mode .story-node text,
  .dark-mode .story-caption { fill: #D8EAE1; }
  .dark-mode .story-band-good { fill: #53E07C14; stroke: #53E07C33; }
  .dark-mode .story-band-warn { fill: #F2B84B18; stroke: #F2B84B44; }
  .surface-grid, .small-multiples, .results, .matching, .empty-state {
    max-width: 1180px;
    margin: 24px auto 0;
  }
  .surface-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .info-card, .card, .matching, .empty-state {
    background: ${SURFACE};
    border: 1px solid ${LINE};
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 14px 36px #0B1F1A0B;
  }
  .info-card h3, .card h3 {
    margin: 0;
    color: ${DEEP};
    font-size: 16px;
    line-height: 22px;
    letter-spacing: -.02em;
  }
  .info-card p, .microcopy, .empty-state p {
    margin: 8px 0 0;
    color: ${MUTED};
    font-size: 13px;
    line-height: 20px;
  }
  .small-multiples {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 12px;
  }
  .mini-card {
    background: white;
    border: 1px solid ${LINE};
    border-radius: 16px;
    padding: 12px;
  }
  .mini-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: ${INK};
    font-size: 12px;
  }
  .mini-head b { font-size: 10px; white-space: nowrap; }
  .spark { width: 100%; height: 42px; margin-top: 8px; }
  .matching { animation: sharedOpen 360ms cubic-bezier(.2,.9,.2,1) both; }
  .stream-title { font-size: 18px; line-height: 24px; font-weight: 800; color: ${DEEP}; margin-bottom: 14px; }
  .step-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .step {
    padding: 14px;
    border: 1px solid ${LINE};
    border-radius: 16px;
    background: ${BG};
    animation: streamIn 520ms cubic-bezier(.2,.9,.2,1) both;
  }
  .step span { color: ${QBO}; font-size: 11px; font-weight: 800; }
  .step b { display: block; margin-top: 4px; font-size: 13px; }
  .matching p { color: ${MUTED}; margin: 14px 0 0; font-size: 13px; }
  .shared-open { animation: sharedOpen 420ms cubic-bezier(.2,.9,.2,1) both; }
  .result-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
  }
  h2 {
    margin: 4px 0 6px;
    color: ${DEEP};
    font-size: 30px;
    line-height: 38px;
    letter-spacing: -.035em;
  }
  .result-header p { margin: 0; color: ${MUTED}; font-size: 14px; }
  .verdict {
    min-width: 190px;
    border: 2px solid;
    border-radius: 20px;
    padding: 14px 16px;
    background: white;
  }
  .verdict span { display: block; font-size: 18px; font-weight: 900; }
  .verdict b { display: block; color: ${MUTED}; margin-top: 4px; font-size: 12px; }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 18px;
  }
  .kpi {
    background: white;
    border: 1px solid ${LINE};
    border-radius: 18px;
    padding: 16px;
  }
  .kpi small { color: ${MUTED}; text-decoration: line-through; margin-right: 8px; }
  .kpi b { display: block; margin-top: 4px; font-size: 28px; line-height: 34px; letter-spacing: -.04em; }
  .primary-grid {
    display: grid;
    grid-template-columns: 1.25fr .95fr .9fr;
    gap: 16px;
  }
  .secondary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-top: 16px;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
    margin-bottom: 14px;
  }
  .chart { height: 220px; min-width: 0; }
  .chart.tall { height: 268px; }
  .chart.small { height: 142px; }
  .action-block {
    min-height: 268px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .action-block h4 { margin: 0; color: ${DEEP}; font-size: 20px; line-height: 26px; }
  .action-block p { margin: 0; color: ${MUTED}; font-size: 13px; line-height: 20px; }
  .action-block button { min-height: 42px; }
  .action-block button.secondary { background: white; color: ${QBO}; border: 1px solid ${QBO}; }
  .action-block.danger button { background: ${RED}; }
  .engine-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .engine-stats div {
    padding: 12px;
    border-radius: 14px;
    background: ${BG};
    border: 1px solid ${LINE};
  }
  .engine-stats span {
    display: block;
    color: ${MUTED};
    font-size: 11px;
    line-height: 15px;
  }
  .engine-stats b {
    display: block;
    color: ${DEEP};
    font-size: 20px;
    line-height: 28px;
    margin-top: 3px;
  }
  .engine-stats .microcopy { grid-column: 1 / -1; }
  .spring-slider {
    margin: 4px 0;
    padding: 14px;
    border-radius: 16px;
    background: ${BG};
    border: 1px solid ${LINE};
  }
  .spring-slider div { display: flex; justify-content: space-between; font-size: 13px; color: ${MUTED}; }
  .spring-slider b { color: ${DEEP}; }
  input[type=range] {
    width: 100%;
    accent-color: ${QBO};
    margin: 12px 0 4px;
    transition: transform 180ms cubic-bezier(.34,1.56,.64,1);
  }
  input[type=range]:active { transform: scale(1.015); }
  .spring-slider small { color: ${QBO}; font-weight: 800; }
  .heatmap {
    display: grid;
    grid-template-columns: 58px repeat(6, 1fr);
    gap: 6px;
    align-items: stretch;
  }
  .heatmap > b {
    color: ${MUTED};
    font-size: 11px;
    text-align: center;
  }
  .heat-row { display: contents; }
  .heat-row span {
    color: ${MUTED};
    font-size: 12px;
    text-transform: uppercase;
    align-self: center;
  }
  .heat-row div {
    min-height: 42px;
    border-radius: 10px;
    color: ${DEEP};
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
  }
  .viz-section {
    margin-top: 16px;
    padding: 20px;
    border-radius: 28px;
    background:
      radial-gradient(520px 240px at 100% 0%, #DDF6E5 0%, transparent 70%),
      linear-gradient(180deg, #F4FAF6 0%, #EAF3ED 100%);
    border: 1px solid #D7E6DC;
  }
  .viz-tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    max-width: 560px;
    margin-bottom: 14px;
    padding: 4px;
    border-radius: 999px;
    background: white;
    border: 1px solid ${LINE};
    overflow: hidden;
  }
  .viz-tabs button {
    position: relative;
    z-index: 2;
    height: 36px;
    background: transparent;
    color: ${MUTED};
    box-shadow: none;
  }
  .viz-tabs button.active { color: white; }
  .viz-tabs i {
    position: absolute;
    z-index: 1;
    top: 4px;
    left: 4px;
    width: calc((100% - 8px) / 4);
    height: 36px;
    border-radius: 999px;
    background: ${QBO};
    transition: transform 320ms cubic-bezier(.34,1.56,.64,1);
  }
  .viz-gallery {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .viz-card {
    background: ${SURFACE};
    border: 1px solid ${LINE};
    border-radius: 24px;
    padding: 22px;
    min-height: 360px;
    box-shadow: 0 18px 48px #0B1F1A10;
    transition: transform 220ms cubic-bezier(.2,.9,.2,1), box-shadow 220ms ease;
  }
  .viz-card:hover {
    transform: translateY(-4px) scale(1.006);
    box-shadow: 0 30px 70px #0B1F1A18;
  }
  .card-head.compact { margin-bottom: 16px; }
  .card-head.compact h3 { font-size: 18px; letter-spacing: -.02em; }
  .card-head.compact span { font-size: 13px; }
  .mini-viz {
    width: 100%;
    height: 270px;
    overflow: visible;
  }
  .mini-viz.readable text { font-size: 15px; font-weight: 850; fill: ${MUTED}; }
  .mini-viz line { stroke: ${LINE}; stroke-width: 3; }
  .mini-viz text { fill: ${MUTED}; font-size: 13px; font-weight: 850; }
  .mini-viz rect,
  .mini-viz circle,
  .mini-viz path,
  .mini-viz polyline,
  .mini-viz polygon {
    vector-effect: non-scaling-stroke;
  }
  .interaction-strip {
    display: grid;
    grid-template-columns: 160px 1fr 220px;
    gap: 14px;
    margin-top: 16px;
    align-items: stretch;
  }
  .radial-wrap {
    position: relative;
    min-height: 116px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    background: white;
    border: 1px solid ${LINE};
  }
  .radial-main { width: 88px; height: 88px; border-radius: 999px; }
  .radial-menu {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .radial-menu button {
    position: absolute;
    width: 58px;
    height: 34px;
    background: ${DEEP};
    font-size: 11px;
    pointer-events: auto;
    animation: radialIn 220ms ease both;
  }
  .radial-menu button:nth-child(1) { left: 10px; top: 14px; }
  .radial-menu button:nth-child(2) { right: 10px; top: 14px; }
  .radial-menu button:nth-child(3) { left: 50px; bottom: 10px; }
  .reorder-card {
    padding: 14px;
    border-radius: 20px;
    background: white;
    border: 1px solid ${LINE};
  }
  .reorder-card b { display: block; margin-bottom: 10px; }
  .reorder-card div { display: flex; gap: 10px; flex-wrap: wrap; }
  .reorder-card button {
    background: ${BG};
    color: ${DEEP};
    border: 1px solid ${LINE};
    padding: 10px 12px;
    animation: gapShift 260ms cubic-bezier(.34,1.56,.64,1);
  }
  .success-button {
    position: relative;
    overflow: hidden;
    min-height: 116px;
    border-radius: 20px;
    background: ${QBO};
  }
  .confetti {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .confetti i {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 10px;
    border-radius: 2px;
    background: ${WARN};
    opacity: 0;
    transform: rotate(calc(var(--i) * 31deg));
  }
  .success-button:active .confetti i {
    animation: burst 700ms ease-out forwards;
    animation-delay: calc(var(--i) * 20ms);
  }
  .toast-stack {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 30;
    display: grid;
    gap: 10px;
    width: min(320px, calc(100vw - 44px));
  }
  .toast {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    min-height: 48px;
    padding: 12px 14px;
    color: white;
    background: ${DEEP};
    border-radius: 16px;
    box-shadow: 0 20px 60px #0B1F1A33;
    animation: toastIn 260ms cubic-bezier(.34,1.56,.64,1) both;
  }
  .toast span { color: #FFFFFF99; font-size: 11px; }
  .surface-lab {
    margin-top: 16px;
    padding: 18px;
    border-radius: 24px;
    background: white;
    border: 1px solid ${LINE};
    box-shadow: 0 14px 36px #0B1F1A0B;
  }
  .lab-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .lab-head h2 { margin: 4px 0 12px; font-size: 24px; line-height: 30px; }
  .fab {
    width: 52px;
    height: 52px;
    border-radius: 999px;
    font-size: 28px;
    box-shadow: 0 16px 40px #2CA01C30;
  }
  .lab-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 4px 0 16px;
  }
  .lab-tabs button {
    background: ${BG};
    color: ${MUTED};
    border: 1px solid ${LINE};
    padding: 8px 11px;
  }
  .lab-tabs button.active { background: ${QBO}; color: white; border-color: ${QBO}; }
  .lab-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .lab-card {
    position: relative;
    min-height: 130px;
    padding: 14px;
    border-radius: 18px;
    background: ${BG};
    border: 1px solid ${LINE};
  }
  .lab-card.wide { grid-column: span 2; }
  .lab-card h3 { margin: 0 0 10px; font-size: 14px; color: ${DEEP}; }
  .lab-card p { color: ${MUTED}; font-size: 12px; line-height: 18px; margin: 8px 0 0; }
  .lab-card input, .lab-card textarea {
    width: 100%;
    background: white;
    border: 1px solid ${LINE};
    border-radius: 12px;
    padding: 9px 10px;
  }
  .lab-card textarea { min-height: 72px; resize: vertical; }
  .stepper { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stepper button {
    min-height: 58px;
    background: white;
    color: ${MUTED};
    border: 1px solid ${LINE};
  }
  .stepper button.done { background: #F0FBF2; color: ${QBO}; border-color: ${QBO}; }
  .stepper span { display: block; font-size: 10px; margin-top: 3px; }
  .ok { color: ${QBO} !important; font-weight: 800; }
  .warn { color: ${WARN} !important; font-weight: 800; }
  .tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag-row button, .segmented button {
    background: white;
    color: ${DEEP};
    border: 1px solid ${LINE};
    padding: 8px 10px;
  }
  .tag-row button.selected, .segmented button.active { background: ${QBO}; color: white; border-color: ${QBO}; }
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .switch input { display: none; }
  .switch span {
    display: block;
    width: 48px;
    height: 28px;
    border-radius: 999px;
    background: ${QBO};
    position: relative;
  }
  .switch span:after {
    content: "";
    position: absolute;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: white;
    top: 3px;
    right: 3px;
  }
  .otp { display: flex; gap: 8px; margin-top: 12px; }
  .otp input { width: 42px; text-align: center; font-weight: 900; }
  .autocomplete { margin-top: 8px; display: grid; gap: 8px; }
  .autocomplete b { display: block; color: ${MUTED}; font-size: 11px; margin-bottom: 4px; }
  .autocomplete button {
    margin-right: 6px;
    background: white;
    color: ${DEEP};
    border: 1px solid ${LINE};
    padding: 6px 8px;
  }
  .dropzone {
    border-style: dashed;
    display: grid;
    place-items: center;
    text-align: center;
  }
  .breadcrumbs { color: ${MUTED}; font-size: 12px; margin-bottom: 10px; }
  .mega-menu { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .mega-menu div, .kanban div {
    background: white;
    border: 1px solid ${LINE};
    border-radius: 14px;
    padding: 10px;
  }
  .mega-menu span, .kanban span { display: block; color: ${MUTED}; font-size: 11px; margin-top: 3px; }
  .icon-rail, .bottom-nav, .pagination { display: flex; gap: 8px; align-items: center; }
  .icon-rail { flex-direction: column; align-items: flex-start; }
  .icon-rail button { width: 42px; height: 42px; border-radius: 14px; }
  .bottom-nav button, .pagination button, .load-more, .secondary-lab {
    background: white;
    color: ${DEEP};
    border: 1px solid ${LINE};
    padding: 8px 10px;
  }
  .toc { display: grid; gap: 8px; }
  .toc a { color: ${MUTED}; font-size: 13px; border-left: 3px solid ${LINE}; padding-left: 8px; }
  .toc a.active { color: ${QBO}; border-color: ${QBO}; font-weight: 900; }
  .indeterminate {
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, ${QBO}, transparent);
    background-size: 200% 100%;
    animation: shimmer 1.2s linear infinite;
  }
  .mini-steps { display: flex; gap: 10px; }
  .mini-steps span {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: ${LINE};
  }
  .mini-steps span.done { background: ${QBO}; }
  .banner { padding: 8px 10px; border-radius: 12px; font-weight: 800; }
  .banner.success { background: #ECF8EF; color: ${QBO}; }
  .banner.warn { background: #FFF8E6; color: #9B6B00; }
  .banner.error { background: #FDEDEB; color: ${RED}; }
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 28px;
    height: 24px;
    border-radius: 999px;
    background: ${RED};
    color: white;
    font-size: 12px;
    font-weight: 900;
    margin-right: 10px;
  }
  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: ${QBO};
    box-shadow: 0 0 0 6px #2CA01C18;
  }
  .tooltip { position: relative; color: ${DEEP}; font-weight: 800; font-size: 12px; }
  .tooltip i {
    display: none;
    position: absolute;
    left: 0;
    top: 22px;
    width: 190px;
    background: ${DEEP};
    color: white;
    border-radius: 12px;
    padding: 8px;
    font-style: normal;
    z-index: 3;
  }
  .tooltip:hover i { display: block; }
  .popover {
    margin-top: 10px;
    padding: 10px;
    border-radius: 12px;
    background: white;
    color: ${MUTED};
    border: 1px solid ${LINE};
    font-size: 12px;
  }
  .accordion { border-top: 1px solid ${LINE}; padding: 8px 0; }
  .accordion button { background: transparent; color: ${DEEP}; padding: 0; box-shadow: none; }
  .split-pane {
    display: grid;
    grid-template-columns: 1fr 8px 1fr;
    gap: 10px;
    min-height: 90px;
  }
  .split-pane div {
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: white;
    border: 1px solid ${LINE};
    color: ${MUTED};
  }
  .split-pane i { border-radius: 999px; background: ${QBO}; cursor: col-resize; }
  .mini-modal {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: #0B1F1A55;
  }
  .mini-modal > div {
    width: min(420px, 92vw);
    background: white;
    border-radius: 24px;
    padding: 22px;
    box-shadow: 0 24px 80px #0B1F1A33;
  }
  .side-drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 40;
    width: min(360px, 90vw);
    background: white;
    padding: 22px;
    box-shadow: -20px 0 70px #0B1F1A24;
    animation: toastIn 240ms ease both;
  }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; }
  th, td { padding: 9px; text-align: left; border-bottom: 1px solid ${LINE}; font-size: 12px; }
  th { color: ${MUTED}; cursor: pointer; }
  .bulk-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 8px;
    background: ${DEEP};
    color: white;
    border-radius: 12px;
    font-size: 12px;
  }
  .bulk-bar button { background: white; color: ${DEEP}; padding: 6px 8px; }
  .kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tree { margin: 0; color: ${DEEP}; font-size: 13px; }
  .virtual-list { max-height: 130px; overflow: auto; display: grid; gap: 6px; }
  .virtual-list span { background: white; border: 1px solid ${LINE}; border-radius: 10px; padding: 7px; font-size: 12px; color: ${MUTED}; }
  .carousel, .zoom-view {
    min-height: 118px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    color: white;
    font-weight: 900;
    background: linear-gradient(135deg, ${QBO}, ${BLUE});
    cursor: pointer;
  }
  .carousel.large { min-height: 220px; }
  .before-after {
    position: relative;
    min-height: 120px;
    overflow: hidden;
    border-radius: 16px;
    background: ${DEEP};
    color: white;
  }
  .before-after div {
    position: absolute;
    inset: 0 auto 0 0;
    display: grid;
    place-items: center;
    background: ${QBO};
    overflow: hidden;
  }
  .before-after span {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    background: white;
  }
  .before-after b {
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
  }
  .zoom-view { transition: transform 220ms ease; }
  .zoom-view:hover { transform: scale(1.04); }
  .avatars { display: flex; align-items: center; }
  .avatars span, .avatars b {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    margin-left: -8px;
    border: 3px solid ${BG};
    background: ${QBO};
    color: white;
    font-size: 12px;
  }
  .avatars span:first-child { margin-left: 0; }
  .avatars span:nth-child(2) { background: ${BLUE}; }
  .avatars span:nth-child(3) { background: ${WARN}; }
  .avatars b { background: ${DEEP}; }
  .cohort-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    margin-top: 12px;
  }
  .calendar-viz {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 7px;
    height: 210px;
    align-content: center;
  }
  .calendar-viz span {
    aspect-ratio: 1;
    border-radius: 7px;
  }
  .cohort-grid div {
    min-height: 28px;
    border-radius: 8px;
    color: ${DEEP};
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 900;
  }
  .region-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .region-grid div {
    min-height: 48px;
    border-radius: 12px;
    color: ${DEEP};
    display: grid;
    place-items: center;
  }
  .region-grid b { font-size: 14px; }
  .region-grid span { font-size: 11px; font-weight: 900; }
  .trust-toggle {
    width: 100%;
    margin-top: 16px;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    background: ${DEEP};
  }
  .assumption-panel {
    margin: 0 0 18px;
    padding: 20px;
    border-radius: 24px;
    background: white;
    border: 1px solid ${LINE};
    box-shadow: 0 16px 44px #0B1F1A0D;
  }
  .assumption-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .assumption-head h3 {
    margin: 4px 0 6px;
    color: ${DEEP};
    font-size: 22px;
    line-height: 28px;
  }
  .assumption-head p {
    margin: 0;
    max-width: 720px;
    color: ${MUTED};
    font-size: 13px;
    line-height: 20px;
  }
  .break-badge {
    min-width: 170px;
    border-radius: 18px;
    padding: 12px 14px;
    text-align: right;
  }
  .break-badge.good { background: #ECF8EF; color: ${QBO}; }
  .break-badge.bad { background: #FDEDEB; color: ${RED}; }
  .break-badge span {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 900;
  }
  .break-badge b {
    display: block;
    margin-top: 4px;
    font-size: 22px;
    line-height: 28px;
  }
  .assumption-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .assumption-slider {
    padding: 12px;
    border-radius: 16px;
    background: ${BG};
    border: 1px solid ${LINE};
  }
  .assumption-slider span {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: ${MUTED};
    font-size: 11px;
    line-height: 15px;
    font-weight: 800;
  }
  .assumption-slider b {
    color: ${DEEP};
    white-space: nowrap;
  }
  .break-even-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 14px;
  }
  .break-even-strip div {
    padding: 12px;
    border-radius: 16px;
    background: #F6FAF7;
    border: 1px solid ${LINE};
  }
  .break-even-strip span {
    display: block;
    color: ${MUTED};
    font-size: 11px;
    line-height: 15px;
  }
  .break-even-strip b {
    display: block;
    color: ${DEEP};
    margin-top: 4px;
    font-size: 16px;
  }
  .dark-mode .assumption-panel,
  .dark-mode .assumption-slider,
  .dark-mode .break-even-strip div {
    background: #10241E;
    border-color: #FFFFFF26;
  }
  .dark-mode .assumption-head h3,
  .dark-mode .assumption-slider b,
  .dark-mode .break-even-strip b {
    color: #F4FFF8;
  }
  .dark-mode .assumption-head p,
  .dark-mode .assumption-slider span,
  .dark-mode .break-even-strip span {
    color: #B9CBC3;
  }
  .ml-stack {
    margin-top: 16px;
    padding: 20px;
    border-radius: 24px;
    background: ${DEEP};
    color: white;
    box-shadow: 0 24px 70px #0B1F1A24;
  }
  .ml-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  .ml-header h2 {
    color: white;
    margin: 4px 0 6px;
  }
  .ml-header p {
    max-width: 760px;
    margin: 0;
    color: #C8D7D0;
    font-size: 13px;
    line-height: 20px;
  }
  .router-badge {
    white-space: nowrap;
    border: 1px solid #FFFFFF33;
    border-radius: 999px;
    padding: 8px 12px;
    color: #DFF7E6;
    font-size: 12px;
    font-weight: 900;
  }
  .tool-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .tool-card {
    min-height: 82px;
    padding: 12px;
    border-radius: 16px;
    background: #FFFFFF0D;
    border: 1px solid #FFFFFF18;
    opacity: .64;
  }
  .tool-card.active {
    background: #2CA01C20;
    border-color: #53E07C77;
    opacity: 1;
  }
  .tool-card b {
    display: block;
    color: white;
    font-size: 12px;
    line-height: 16px;
  }
  .tool-card span {
    display: block;
    margin-top: 5px;
    color: #C8D7D0;
    font-size: 11px;
    line-height: 15px;
  }
  .ml-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0;
  }
  .ml-card {
    background: white;
    color: ${INK};
    border-radius: 18px;
    padding: 16px;
  }
  .ml-card h3 {
    margin: 0 0 10px;
    color: ${DEEP};
    font-size: 14px;
    line-height: 19px;
  }
  .ml-card p {
    color: ${MUTED};
    font-size: 12px;
    line-height: 18px;
    margin: 10px 0 0;
  }
  .metric {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid ${LINE};
    padding: 7px 0;
  }
  .metric span {
    color: ${MUTED};
    font-size: 11px;
    line-height: 15px;
  }
  .metric b {
    color: ${DEEP};
    font-size: 12px;
    text-align: right;
  }
  .sensitivity-bars {
    display: grid;
    gap: 7px;
    margin-top: 10px;
  }
  .sensitivity-bars div {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 8px;
    align-items: center;
  }
  .sensitivity-bars span {
    color: ${MUTED};
    font-size: 10px;
  }
  .sensitivity-bars i {
    height: 8px;
    border-radius: 999px;
    background: ${QBO};
  }
  .ml-stack > .card {
    box-shadow: none;
  }
  .trust-panel {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-top: 14px;
  }
  .closer {
    margin-top: 28px;
    padding: 26px 0 4px;
    text-align: center;
    color: ${DEEP};
    font-size: 24px;
    line-height: 32px;
    font-weight: 900;
    letter-spacing: -.035em;
  }
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: #0B1F1A55;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 24px;
    animation: fadeBackdrop 180ms ease both;
  }
  .destination-shell {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #F4F7F5;
    animation: sharedOpen 260ms cubic-bezier(.2,.9,.2,1) both;
  }
  .qb-page {
    height: 100%;
    display: grid;
    grid-template-columns: 236px 1fr;
    color: ${INK};
    background: #F4F7F5;
  }
  .qb-rail {
    background: #12382F;
    color: white;
    padding: 22px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .qb-logo {
    width: 46px;
    height: 46px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: ${QBO};
    font-weight: 900;
    margin-bottom: 16px;
  }
  .qb-rail button {
    height: 42px;
    padding: 0 12px;
    text-align: left;
    background: transparent;
    color: #D8EAE1;
    box-shadow: none;
  }
  .qb-rail button.active {
    background: #FFFFFF18;
    color: white;
  }
  .qb-main {
    min-width: 0;
    overflow: auto;
  }
  .qb-header {
    height: 72px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 32px;
    border-bottom: 1px solid ${LINE};
    background: white;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .qb-header button {
    background: white;
    border: 1px solid ${LINE};
    color: ${DEEP};
    padding: 10px 12px;
  }
  .qb-header div {
    text-align: right;
    color: ${MUTED};
    font-size: 12px;
  }
  .qb-header b {
    display: block;
    color: ${QBO};
    margin-top: 3px;
  }
  .qb-content {
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px;
  }
  .qb-hero-card {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 28px;
    align-items: center;
    border-radius: 28px;
    padding: 30px;
    color: white;
    box-shadow: 0 24px 70px #0B1F1A18;
  }
  .qb-hero-card.capital {
    background: linear-gradient(135deg, #12382F, #2CA01C);
  }
  .qb-hero-card.attach {
    background: linear-gradient(135deg, #102B62, #236CFF);
  }
  .qb-kicker {
    display: block;
    font-size: 12px;
    letter-spacing: .1em;
    text-transform: uppercase;
    font-weight: 900;
    opacity: .82;
  }
  .qb-hero-card h2 {
    color: white;
    margin: 8px 0 10px;
    font-size: 34px;
    line-height: 40px;
  }
  .qb-hero-card p {
    max-width: 650px;
    margin: 0;
    color: #E9FFF0;
    font-size: 15px;
    line-height: 23px;
  }
  .offer-card {
    border-radius: 22px;
    background: #FFFFFF;
    color: ${DEEP};
    padding: 22px;
    box-shadow: 0 20px 60px #0B1F1A20;
  }
  .offer-card span,
  .offer-card small {
    display: block;
    color: ${MUTED};
    font-size: 12px;
  }
  .offer-card b {
    display: block;
    margin: 6px 0;
    color: ${QBO};
    font-size: 38px;
    line-height: 44px;
    letter-spacing: -.05em;
  }
  .qb-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 18px;
    margin-top: 22px;
  }
  .qb-panel {
    background: white;
    border: 1px solid ${LINE};
    border-radius: 22px;
    padding: 22px;
    box-shadow: 0 14px 36px #0B1F1A0B;
  }
  .qb-panel.wide {
    grid-row: span 2;
  }
  .qb-panel h3 {
    margin: 0 0 14px;
    color: ${DEEP};
    font-size: 18px;
  }
  .qb-panel p {
    color: ${MUTED};
    font-size: 14px;
    line-height: 22px;
  }
  .capital-bars {
    display: grid;
    gap: 18px;
  }
  .capital-bars div {
    display: grid;
    grid-template-columns: 160px 1fr 90px;
    gap: 12px;
    align-items: center;
  }
  .capital-bars span {
    color: ${MUTED};
    font-size: 13px;
  }
  .capital-bars i {
    height: 16px;
    border-radius: 999px;
  }
  .capital-bars b {
    text-align: right;
    color: ${DEEP};
  }
  .qb-step,
  .qb-check {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid ${LINE};
    color: ${INK};
    font-size: 14px;
  }
  .qb-step b {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #ECF8EF;
    color: ${QBO};
  }
  .setup-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .setup-form label {
    color: ${MUTED};
    font-size: 12px;
    font-weight: 800;
  }
  .setup-form input {
    margin-top: 6px;
    background: #F7F9F8;
    border: 1px solid ${LINE};
    border-radius: 12px;
    padding: 11px 12px;
    color: ${DEEP};
    font-weight: 800;
  }
  .dark-mode .destination-shell,
  .dark-mode .qb-page,
  .dark-mode .qb-main {
    background: #071713;
  }
  .dark-mode .qb-header,
  .dark-mode .qb-panel,
  .dark-mode .offer-card {
    background: #10241E;
    border-color: #FFFFFF26;
    color: white;
  }
  .dark-mode .qb-header button,
  .dark-mode .setup-form input {
    background: #17332A;
    border-color: #FFFFFF26;
    color: white;
  }
  .dark-mode .qb-panel h3,
  .dark-mode .capital-bars b,
  .dark-mode .qb-step,
  .dark-mode .qb-check,
  .dark-mode .offer-card {
    color: white;
  }
  .dark-mode .qb-panel p,
  .dark-mode .capital-bars span,
  .dark-mode .offer-card span,
  .dark-mode .offer-card small {
    color: #B9CBC3;
  }
  .insight-sheet {
    width: min(760px, 100%);
    background: white;
    border-radius: 28px 28px 20px 20px;
    padding: 12px 22px 22px;
    box-shadow: 0 -20px 80px #0B1F1A33;
    animation: sheetUp 360ms cubic-bezier(.2,.9,.2,1) both;
  }
  .sheet-handle {
    width: 48px;
    height: 5px;
    border-radius: 999px;
    background: ${LINE};
    margin: 0 auto 16px;
  }
  .brief-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .empty-state h2 { margin: 0; }
  .reveal {
    animation: fadeUp both;
    animation-timeline: view();
    animation-range: entry 0% cover 28%;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes sharedOpen {
    from { opacity: 0; transform: translateY(18px) scale(.985); border-radius: 28px; }
    to { opacity: 1; transform: translateY(0) scale(1); border-radius: 20px; }
  }
  @keyframes streamIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes kinetic {
    0%, 100% { transform: translateY(0) skewX(0deg); letter-spacing: -0.04em; }
    50% { transform: translateY(-2px) skewX(-3deg); letter-spacing: -0.01em; }
  }
  @keyframes cursorFloat {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(4px, -3px); }
  }
  @keyframes bandIn {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes drawPath { to { stroke-dashoffset: 0; } }
  @keyframes dotIn { to { opacity: 1; } }
  @keyframes travelPath {
    0% { offset-distance: 0%; opacity: 0; }
    8% { opacity: 1; }
    92% { opacity: 1; }
    100% { offset-distance: 100%; opacity: 0; }
  }
  @keyframes fadeBackdrop { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sheetUp {
    from { transform: translateY(28px); opacity: .4; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes radialIn {
    from { opacity: 0; transform: scale(.7) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes gapShift {
    from { transform: translateX(12px); opacity: .5; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes burst {
    0% { opacity: 1; transform: translate(0,0) rotate(calc(var(--i) * 31deg)); }
    100% {
      opacity: 0;
      transform: translate(calc((var(--i) - 5) * 14px), calc(-36px - (var(--i) % 4) * 12px)) rotate(calc(var(--i) * 71deg));
    }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(24px) scale(.96); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  @media (max-width: 980px) {
    .hero, .surface-grid, .primary-grid, .secondary-grid, .trust-panel, .kpi-row, .viz-gallery, .brief-grid, .tool-grid, .ml-metrics, .interaction-strip, .lab-grid, .kanban, .mega-menu, .assumption-grid, .break-even-strip { grid-template-columns: 1fr; }
    .assumption-head { flex-direction: column; }
    .lab-card.wide { grid-column: span 1; }
    .ml-header { flex-direction: column; }
    .small-multiples { grid-template-columns: repeat(2, 1fr); }
    h1 { font-size: 36px; line-height: 44px; }
    .result-header { align-items: stretch; flex-direction: column; }
    .viz-tabs { max-width: none; }
    .qb-page { grid-template-columns: 1fr; }
    .qb-rail { display: none; }
    .qb-hero-card, .qb-grid, .setup-form { grid-template-columns: 1fr; }
    .qb-content { padding: 18px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, .reveal { animation: none !important; transition: none !important; }
  }
`;
