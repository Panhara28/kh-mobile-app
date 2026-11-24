// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_setting } from "../generated/tables";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";

export interface Printer {
  id: string;
  name: string;
  printerName: string;
  ip: string;
  port: number;
}

export class PrintServer {
  constructor(protected knex: Db, protected user: UserInfo) {}

  async getAllPrinters(): Promise<Printer[]> {
    const printServerSetting = await this.knex.row<table_setting>("setting", { AND: [{ option: "PRINT_SERVER" }, { warehouse: this.user.currentWarehouseId }] });

    if (!printServerSetting) {
      return [];
    }
    try {
      const printers = JSON.parse(printServerSetting.value).printers;
      return printers.map(
        (printer: {
          id: string;
          name: string;
          printer_name: string;
          ip: string;
          port: number;
        }) => ({
          id: printer.id,
          name: printer.name,
          printerName: printer.printer_name,
          ip: printer.ip,
          port: printer.port,
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return [];
    }
  }
}
