// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface MetricsItem {
  date: string;
  orderDetailId: string;
  sale: number;
  cost: number;
  profit: number;
}

export interface MetricsSummary {
  sale: number;
  cost: number;
  profit: number;
}

export interface MetricsComparison extends MetricsSummary {
  saleDiff: number;
  salePercentChange: number;
  saleDirection: string;
  costDiff: number;
  costPercentChange: number;
  costDirection: string;
  profitDiff: number;
  profitPercentChange: number;
  profitDirection: string;
  profitMargin: number;
  profitMarginDiff: number;
  profitMarginDirection: string;
}
