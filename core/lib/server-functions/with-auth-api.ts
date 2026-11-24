// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../db/db";
import { headers } from "../../next-compat/request-context";
import { NextRequest, NextResponse } from "../../next-compat/server";
import { assertSetupComplete } from "../../classes/setup";
import { getWarehouseInfo, isInWarehouseZone } from "../../classes/authentication/customer-auth";
import { Logger, LogLevel } from "../logger";
import { isPermitted, requiredPermission } from "./api-permissions";
import getAuthFromToken, { getCustomerAuthFromToken, getSystemAdmin, type UserAuth } from "./get-auth-from-token";
import { decodeDeviceLabel, getClientIp, resolveDeviceName } from "./parse-user-agent";
import withDatabaseApi from "./with-database-api";

export { getSystemAdmin };

export default function withAuthApi<ParamType = unknown, InputType = unknown, OutputType = unknown, SearchParamType = unknown>(
  callback: (props: {
    db: Db;
    req: NextRequest;
    body?: InputType;
    params?: ParamType;
    searchParams?: SearchParamType;
    logger: Logger;
    userAuth: UserAuth;
  }) => Promise<NextResponse<OutputType>>,
  authType: ("ADMIN" | "CUSTOMER" | "PUBLIC")[] = ["ADMIN"],
) {
  return withDatabaseApi<ParamType, InputType, OutputType, SearchParamType>(async ({ db, req, body, params, searchParams }) => {
    const headerList = await headers();
    const token = headerList.get("authorization")?.startsWith("Bearer ") ? headerList.get("authorization")?.split(" ")[1] : "";

    if (!token && !authType.includes("PUBLIC")) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as OutputType, { status: 401 });
    }

    const userAuth: UserAuth = {
      admin: undefined,
      customer: undefined,
    };

    // Staff token: one query (user + role + branch). Only when it isn't a staff token is the customer token checked;
    // the old code always ran both lookups (4-5 sequential queries before every handler).
    const user = await getAuthFromToken(db, token || "");
    if (user) userAuth.admin = user;

    const customerAuth = user ? null : await getCustomerAuthFromToken(db, token || "");
    // for walk-in customer, we will use system admin as userAuth.admin
    if (customerAuth) {
      userAuth.customer = customerAuth;
      if (customerAuth.isWalkin && !userAuth.admin) {
        const warehouse = await getWarehouseInfo(db, customerAuth.warehouseId);
        if (warehouse) {
          const isInZone = isInWarehouseZone(warehouse, customerAuth.lat!, customerAuth.lng!);
          if (isInZone) {
            // get system admin for walk-in customer
            const sysAdmin = await getSystemAdmin(customerAuth.warehouseId, db);
            if (sysAdmin) {
              // Context only (branch, created_by): see UserAuth.actingAdmin.
              userAuth.admin = sysAdmin;
              userAuth.actingAdmin = true;
            }
          }
        }
      }
    }

    // check auth type with requested auth type
    const isAuthorized = authType.some((type) => {
      // A walk-in customer's borrowed system admin never counts as an admin.
      if (type === "ADMIN" && userAuth.admin && !userAuth.actingAdmin) return true;
      if (type === "CUSTOMER" && userAuth.customer) return true;
      if (type === "PUBLIC") return true;
      return false;
    });

    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as OutputType, { status: 401 });
    }

    // Role check: a staff member's role decides which areas they may read or change, the same
    // permissions the pages and the mobile app use (see api-permissions.ts).
    if (process.env.API_PERMISSIONS !== "off" && userAuth.admin && !userAuth.actingAdmin) {
      const required = requiredPermission(req.nextUrl.pathname, req.method);
      if (required && !isPermitted(userAuth.admin.role, required)) {
        return NextResponse.json({ success: false, error: "Forbidden" } as OutputType, { status: 403 });
      }
    }

    // Selling is locked until the branch's first-time setup is finished.
    await assertSetupComplete(
      db,
      req.nextUrl.pathname,
      req.method,
      userAuth.admin?.currentWarehouseId ?? userAuth.customer?.warehouseId,
    );

    const userAgent = headerList.get("user-agent");
    const deviceLabel = decodeDeviceLabel(headerList.get("x-device-label"));
    const logger = new Logger(db, user, [LogLevel.Log, LogLevel.Sever], {
      device: resolveDeviceName(deviceLabel, userAgent),
      device_id: headerList.get("x-device-id"),
      ip_address: getClientIp(headerList),
      user_agent: userAgent,
    });

    if (req.method !== "GET") {
      const methodToAction: Record<string, "create" | "update" | "delete"> = {
        post: "create",
        put: "update",
        delete: "delete",
      };
      const action = methodToAction[req.method.toLowerCase()] || "update";

      logger.serverLog(req.nextUrl.pathname, {
        action,
        table_name: req.nextUrl.pathname,
        key: "",
        content: { body } as Record<string, unknown>,
      });
    }

    return callback({
      db,
      req,
      body,
      params,
      searchParams,
      logger,
      userAuth,
    });
  });
}
