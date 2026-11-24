// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * DataLoader for the ported loaders. Batching is kept; per-loader caching is off, because LoaderFactory now
 * shares one loader per request (see loader-factory.ts) and a request that writes then reads (order recalculation)
 * must not get a stale cached row.
 */
import BaseDataLoader from "dataloader";

export default class DataLoader<K, V, C = K> extends BaseDataLoader<K, V, C> {
  constructor(batch: BaseDataLoader.BatchLoadFn<K, V>, options?: BaseDataLoader.Options<K, V, C>) {
    super(batch, { cache: false, ...options });
  }
}
