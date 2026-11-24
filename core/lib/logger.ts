// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { waitUntil } from "@vercel/functions";
import { v4 } from "uuid";
import type { Db } from "../db/db";
import { Formatter } from "./formatter";
import type { UserInfo } from "./server-functions/get-auth-from-token";

export interface Metadata {
  [key: string]: unknown; // Allows additional metadata properties
}
export interface UserLogActivityInput {
  action: "create" | "update" | "delete";
  table_name: string | null;
  key: string;
  content?: Metadata | null;
}

/**
 * Request-scoped context attached to every activity log written by this logger
 * instance, so we can track which device a user acted from.
 */
export interface LogRequestContext {
  device?: string | null;
  device_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export enum LogLevel {
  Sever = "SERVER",
  Debug = "DEBUG",
  Info = "INFO",
  Log = "LOG",
  Warn = "WARN",
  Error = "ERROR",
}

export class Logger {
  private table: string = "user_activity_logs";
  private user: UserInfo | null = null;
  private level: LogLevel[] = [];
  private db?: Db;
  private context: LogRequestContext = {};

  constructor(
    db?: Db,
    user: UserInfo | null = null,
    level: LogLevel[] = [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error, LogLevel.Log],
    context: LogRequestContext = {},
  ) {
    this.db = db;
    this.user = user;
    this.level = level;
    this.context = context;
  }

  /**
   * Saves an activity log row, without holding up the response.
   *
   * Fixes from the old version: the write is registered with waitUntil (on Vercel a fire-and-forget write can be
   * dropped once the response is sent), and a failed write (no signed-in staff, e.g. a customer or public POST)
   * no longer becomes an unhandled promise rejection.
   */
  serverLog(message: string, metadata: UserLogActivityInput) {
    if (!this.user || !this.db) return;
    const p = this.save(metadata)
      .then((res) => {
        if (this.shouldLog(LogLevel.Sever)) console.log(this.formatLog(LogLevel.Sever, message, res));
      })
      .catch((e) => console.error("activity log failed:", e instanceof Error ? e.message : e));
    try {
      waitUntil(p);
    } catch {
      // not running on Vercel: the promise still completes
    }
  }

  log(message: string, metadata: Metadata) {
    if (this.shouldLog(LogLevel.Log)) console.log(this.formatLog(LogLevel.Log, message, metadata));
  }

  info(message: string, metadata: Metadata) {
    if (this.shouldLog(LogLevel.Info)) console.info(this.formatLog(LogLevel.Info, message, metadata));
  }
  warn(message: string, metadata: Metadata) {
    if (this.shouldLog(LogLevel.Warn)) console.warn(this.formatLog(LogLevel.Warn, message, metadata));
  }

  error(message: string, metadata: Metadata) {
    if (this.shouldLog(LogLevel.Error)) console.error(this.formatLog(LogLevel.Error, message, metadata));
  }

  debug(message: string, metadata: Metadata) {
    if (this.shouldLog(LogLevel.Debug)) console.debug(this.formatLog(LogLevel.Debug, message, metadata));
  }

  private async save(log: UserLogActivityInput) {
    if (!this.user) throw new Error("No user information available.");
    if (!this.db) throw new Error("No database connection available.");

    const log_id = v4();
    const timestamp = Formatter.getNowDateTime();
    const logs = {
      ...log,
      log_id,
      content: log.content || null,
      user_id: this.user.id,
      timestamp: timestamp,
      device: this.context.device || null,
      device_id: this.context.device_id || null,
      ip_address: this.context.ip_address || null,
      user_agent: this.context.user_agent || null,
    };
    await this.db.p.user_activity_logs.create({
      data: { ...logs, content: (logs.content ?? {}) as never, key: logs.key ?? "", action: logs.action },
    });
    return logs;
  }

  private shouldLog(level: LogLevel): boolean {
    // In development and testing environments, log all levels, but not in production.
    if (process.env.NODE_ENV === "production") return false;
    return this.level.includes(level);
  }

  private formatLog(level: LogLevel, message: string, metadata: Metadata) {
    const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS format
    const logLabel = `${level}  ${timestamp} (${level === LogLevel.Sever ? "server " : ""}logger) ${message}`;
    const metadataStr = JSON.stringify(metadata, null, 2);
    return `${logLabel} ${metadataStr}`;
  }
}

// only client side purposes
export const logger = new Logger();
