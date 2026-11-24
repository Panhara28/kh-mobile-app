// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { MovieInput } from "../classes/movie";
import { table_movie } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createMovieByVariantIDLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.movie.findMany({
      where: { deleted_at: null, movie_id: { in: [...keys] } },
    })) as unknown as table_movie[];

    return await Promise.all(
      keys.map(async (key) => {
        const row = rows.find((row) => row.movie_id === key);
        if (!row) return null;

        return {
          variantId: row.movie_id,
          durationMinutes: row.duration_minutes,
          rating: row.rating,
          genre: row.genre ? row.genre : [],
          releaseDate: row.release_date
            ? Formatter.date(row.release_date)!
            : "",
          posterUrl: row.poster_url,
          trailerUrl: row.trailer_url,
          director: row.director,
          cast: row.cast ? row.cast : [],
          synopsis: row.synopsis,
          emailProducer: row.email_producer ? row.email_producer : [],
          producerShare: row.producer_share,
          taxRate: row.tax_rate,
        } as MovieInput;
      }),
    );
  });
}
