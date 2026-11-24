// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  table_customer,
  table_restaurant_tables,
  table_warehouse,
} from "../../generated/tables";
import { Formatter } from "../../lib/formatter";
import { generateUserToken } from "../../lib/generate-id";
import { getDistanceFromLatLonInMeters } from "../../lib/utils";
import type { Db } from "../../db/db";
import { z } from "zod";

export const walkinLoginInputSchema = z.object({
  tableId: z.string().uuid(),
  deviceId: z.string(),
  metaData: z.object({}).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type WalkinLoginInput = z.infer<typeof walkinLoginInputSchema>;

export class CustomerAuthentication {
  constructor(protected db: Db) {}

  async walkinLogin(input: WalkinLoginInput): Promise<string> {
    const table = await getTableInfo(this.db, input.tableId);
    if (!table) {
      throw new Error("Table not found");
    }
    const warehouse = await getWarehouseInfo(this.db, table.warehouse_id);
    if (!warehouse) {
      throw new Error("Warehouse not found");
    }
    const isInZone = await isInWarehouseZone(warehouse, input.lat, input.lng);
    if (!isInZone) {
      throw new Error("You are not in the walk-in zone");
    }

    const walkinCustomer = await getWalkinCustomer(this.db, warehouse.id!);
    if (!walkinCustomer) {
      throw new Error("Walk-in customer not found");
    }
    // create customer token
    const now = Formatter.getNowDateTime();
    const expiresAt = Formatter.addDateToNow(1, "day");
    const token = generateUserToken();
    await this.db.insert("customer_token", {
      created_at: now,
      customer_id: walkinCustomer.id!,
      device_id: input.deviceId,
      expires_at: expiresAt, // expire one day later
      metadata: input.metaData ? JSON.stringify(input.metaData) : null,
      platform: "web",
      token,
      token_type: "walk-in",
      table_id: table.id,
      lat: input.lat,
      lng: input.lng,
    });

    return token;
  }
}

async function getTableInfo(db: Db, tableId: string) {
  const table = await db.row<table_restaurant_tables>("restaurant_tables", { id: tableId, deleted_at: null });
  return table;
}

export async function getWarehouseInfo(db: Db, warehouseId: string) {
  const warehouse = await db.row<table_warehouse>("warehouse", { id: warehouseId, is_deleted: 0 });
  return warehouse;
}

export function isInWarehouseZone(
  warehouse: table_warehouse,
  lat: number,
  lng: number
) {
  if (!warehouse.lat || !warehouse.lng) {
    return false;
  }
  const radiusInMeters = warehouse.walkin_radius_in_meters || 100;
  const distance = getDistanceFromLatLonInMeters(
    lat,
    lng,
    Number(warehouse.lat),
    Number(warehouse.lng)
  );
  return distance <= radiusInMeters;
}

async function getWalkinCustomer(db: Db, warehouseId: string) {
  const customer = await db.row<table_customer>("customer", { pos_warehouse_id: warehouseId, customer_name: "Walk In" });
  return customer;
}
