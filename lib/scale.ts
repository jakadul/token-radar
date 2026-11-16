// The comparables scale: what a token is worth per dollar of TVL, measured on the snapshot's own
// live-token protocols instead of assumed.
//
// The snapshot carries 416 protocols whose token already trades, with both a market cap and a TVL.
// Their mcap/tvl ratio is the market's own observed answer to "what is a protocol worth per dollar
// locked", and it is the only such evidence inside the file. It is not flat: a $2B vault and a $20M
// pool trade at very different multiples, and a DEX trades at a very different multiple from a
// liquid-staking receipt. So the scale is measured twice, in log space, and interpolated:
//
//   bySize     log10(multiple) against log10(tvl), fitted across the live set
//   byCategory the live set's per-category median, shrunk toward the bySize curve by how few
//              comparables that category has (n/(n+K)), so a category with three observations
//              barely moves off the curve and one with twelve moves most of the way
//
// Everything here is computed from the snapshot at run time. No protocol name is ever special-cased
// and no multiple is written down by hand; a different snapshot yields a different scale.

import type { SnapshotProtocol } from './model.ts';

/** A live-token protocol: it already trades, so it carries the market's own value. */
export interface Comparable {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** The measured scale, with the evidence that produced it. */
export interface Scale {
  /** The live protocols that carried both a market cap and a TVL, the scale's whole evidence. */
  comparables: Comparable[];
  /** log10(multiple) = intercept + slope * log10(tvl), over every comparable. */
  bySize: { intercept: number; slope: number; n: number };
  /** Per-category medians of log10(multiple), and how many comparables each rests on. */
  byCategory: Map<string, { logMedian: number; n: number }>;
  /** How hard a category's own median pulls the curve: n / (n + shrink_k). */
  shrink_k: number;
  /** The interval every implied value is shown with. */
  band: { low: number; high: number };
}

/** A live protocol's ratio is noise below this market cap: it says more about listing than value. */
const MIN_MCAP = 1_000_000;

/** The shrinkage constant: a category needs this many comparables to move halfway off the curve. */
const SHRINK_K = 6;

/** The log-space band, derived from the comparables' spread, clipped to a sane range. */
const BAND_FLOOR = { low: 0.4, high: 2.2 };

/** log10(x), or NaN for a non-positive input. */
const log10 = (x: number): number => Math.log10(x);

/** The median of a list of numbers (already finite); NaN for an empty one. */
function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Every protocol whose token trades and whose market cap and TVL are both real. */
export function comparablesOf(protocols: SnapshotProtocol[]): Comparable[] {
  const out: Comparable[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd < MIN_MCAP) continue;
    if (p.gecko_id === null && p.symbol === null) continue;
    if (!(p.tvl_usd > 0)) continue;
    out.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      ratio: p.mcap_usd / p.tvl_usd,
    });
  }
  return out.sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** The least-squares line through (log10 tvl, log10 ratio); slope 0 when the fit is degenerate. */
function fitSize(comparables: Comparable[]): { intercept: number; slope: number; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of comparables) {
    const x = log10(c.tvl_usd);
    const y = log10(c.ratio);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  const n = xs.length;
  if (n < 3) return { intercept: log10(0.35), slope: -0.15, n };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  if (den === 0) return { intercept: my, slope: 0, n };
  const slope = num / den;
  return { intercept: my - slope * mx, slope, n };
}

/** The scale from the snapshot's live protocols: the size curve, the category medians, the band. */
export function measureScale(protocols: SnapshotProtocol[]): Scale {
  const comparables = comparablesOf(protocols);
  const bySize = fitSize(comparables);
  const groups = new Map<string, number[]>();
  for (const c of comparables) {
    const key = c.category ?? 'Uncategorised';
    const at = groups.get(key);
    if (at === undefined) groups.set(key, [log10(c.ratio)]);
    else at.push(log10(c.ratio));
  }
  const byCategory = new Map<string, { logMedian: number; n: number }>();
  for (const [key, values] of groups) byCategory.set(key, { logMedian: median(values), n: values.length });

  // The band: the spread the comparables themselves show around the size curve, in log space,
  // clipped so no protocol is ever shown a band wider than an order of magnitude each way.
  const residuals = comparables
    .map((c) => log10(c.ratio) - (bySize.intercept + bySize.slope * log10(c.tvl_usd)))
    .filter((r) => Number.isFinite(r))
    .sort((a, b) => a - b);
  const q = (p: number): number => residuals.length === 0 ? 0 : residuals[Math.min(residuals.length - 1, Math.max(0, Math.floor(p * residuals.length)))]!;
  const low = Math.min(BAND_FLOOR.high, Math.max(BAND_FLOOR.low, Math.pow(10, q(0.2))));
  const high = Math.max(BAND_FLOOR.low, Math.min(BAND_FLOOR.high, Math.pow(10, q(0.8))));
  return { comparables, bySize, byCategory, shrink_k: SHRINK_K, band: { low, high } };
}

/**
 * The log10 multiple a protocol of this TVL and category trades at: the size curve, moved toward
 * its category's own median by n/(n+K) of the way.
 */
export function logMultiple(scale: Scale, tvl_usd: number, category: string | null): { log: number; categoryWeight: number; categoryN: number } {
  const sizeCurve = scale.bySize.intercept + scale.bySize.slope * log10(Math.max(1, tvl_usd));
  const own = scale.byCategory.get(category ?? 'Uncategorised');
  if (own === undefined || !Number.isFinite(own.logMedian)) return { log: sizeCurve, categoryWeight: 0, categoryN: 0 };
  const w = own.n / (own.n + scale.shrink_k);
  return { log: sizeCurve * (1 - w) + own.logMedian * w, categoryWeight: w, categoryN: own.n };
}

/** The comparables a category rests on, largest market cap first, for the detail view's evidence. */
export function peersOf(scale: Scale, category: string | null, limit: number): Comparable[] {
  return scale.comparables
    .filter((c) => (c.category ?? 'Uncategorised') === (category ?? 'Uncategorised'))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, limit);
}
