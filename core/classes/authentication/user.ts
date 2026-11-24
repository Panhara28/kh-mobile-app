// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import bcrypt from "bcryptjs";
import type { Db } from "../../db/db";

export class AuthenticationUser {
  private knex: Db;
  constructor(knex: Db) {
    this.knex = knex;
  }

  async findByUsername(username: string) {
    return this.knex.row<{ id: string; password: string; token: string; is_deleted: number | null }>("user", { username });
  }

  async validatePassword(username: string, password: string) {
    const user = await this.findByUsername(username);
    // Fix: a deleted user could still log in (their token was then refused on every request).
    if (!user || user.is_deleted) {
      return undefined;
    }
    const result = await bcrypt.compare(password, user.password);
    if (!result) return undefined;

    return user.token;
  }

  async changePassword(userId: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.knex.update("user", { id: userId }, { password: hashedPassword });
    return true;
  }
}
