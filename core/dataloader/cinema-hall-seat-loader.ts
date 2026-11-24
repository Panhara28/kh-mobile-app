// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { CinemaHallSeat } from "../classes/cinema/hall";
import { table_cinema_hall, table_cinema_seat } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";

export function createCinemaSeatLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_cinema_seat[] = await db.rows<table_cinema_seat>("cinema_seat", { AND: [{ seat_id: { in: [...keys] } }, { deleted_at: null }] }, { orderBy: [{ row_label: "asc" }] });

    const hallLoader = LoaderFactory.cinemaHallLoader(db);

    return await Promise.all(
      keys.map(async (key) => {
        const row = rows.find((row) => row.seat_id === key);

        if (!row) {
          return null;
        }

        return {
          id: row.seat_id,
          hallId: row.hall_id,
          row: row.row_label,
          column: row.seat_number,
          type: row.seat_type as
            | "standard"
            | "vip"
            | "couple"
            | "wheelchair"
            | "blocked",
          isAvailable: Boolean(row.is_available),
          createdAt: Formatter.dateTime(row.created_at),
          updatedAt: Formatter.dateTime(row.updated_at),
          groupId: row.group_id || null,
          hall: await hallLoader.load(row.hall_id),
        } as CinemaHallSeat;
      }),
    );
  });
}

export function createCinemaHallSeatLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_cinema_seat[] = await db.rows<table_cinema_seat>("cinema_seat", { AND: [{ hall_id: { in: [...keys] } }, { deleted_at: null }] }, { orderBy: [{ row_label: "asc" }] });

    return await Promise.all(
      keys.map(async (key) => {
        const row = rows.filter((row) => row.hall_id === key);

        if (row.length === 0) {
          return null;
        }

        return row.map((seat) => {
          return {
            id: seat.seat_id,
            hallId: seat.hall_id,
            row: seat.row_label,
            column: seat.seat_number,
            type: seat.seat_type as
              | "standard"
              | "vip"
              | "couple"
              | "wheelchair"
              | "blocked",
            isAvailable: Boolean(seat.is_available),
            createdAt: Formatter.dateTime(seat.created_at),
            updatedAt: Formatter.dateTime(seat.updated_at),
            groupId: seat.group_id || null,
          } as CinemaHallSeat;
        });
      }),
    );
  });
}

export function createCinemaHallLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_cinema_hall[] = await db.rows<table_cinema_hall>("cinema_hall", { hall_id: { in: [...keys] } }, { orderBy: [{ created_at: "asc" }] });

    const seatLoader = LoaderFactory.cinemaHallSeatLoader(db);
    const userLoader = LoaderFactory.userLoader(db);

    return await Promise.all(
      keys.map(async (key) => {
        const hall = rows.find((row) => row.hall_id === key);
        if (!hall) {
          return null;
        }
        return {
          id: hall.hall_id,
          name: hall.hall_name,
          number: hall.hall_number,
          columns: hall.columns,
          rows: hall.rows,
          features: hall.hall_features,
          status: hall.status,
          totalSeats: hall.total_seats,
          createdAt: hall.created_at ? Formatter.dateTime(hall.created_at) : "",
          updatedAt: hall.updated_at ? Formatter.dateTime(hall.updated_at) : "",
          createdBy: hall.created_by
            ? await userLoader.load(hall.created_by)
            : null,
          seats: hall.hall_id
            ? (await seatLoader.load(hall.hall_id)) || []
            : [],
          parts: hall.parts ? hall.parts : [],
        };
      }),
    );
  });
}
