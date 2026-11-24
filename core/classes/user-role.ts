// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_user_role } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { generateId } from "../lib/generate-id";
import type { Db } from "../db/db";

export class UserRole {
  constructor(protected tx: Db) {}
  async getDefaultRole(): Promise<table_user_role> {
    const role = await this.tx.row<table_user_role>("user_role", { is_default: 1 });

    if (!role) {
      // If no default role is found, create a new one
      const newRole: table_user_role = {
        id: generateId(),
        created_at: Formatter.getNowDateTime(),
        is_default: 1,
        role: "OWNER",
        permissions: null,
      };
      await this.tx.insert("user_role", newRole);
      return newRole;
    }
    return role as table_user_role;
  }
}
