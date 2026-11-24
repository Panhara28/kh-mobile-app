// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * Role checks for the API, so a role's permissions (the same ones the web middleware uses for pages,
 * and the mobile app uses for its modules) are also enforced when someone calls the API directly.
 *
 * Deliberately conservative: only routes listed below are checked. Anything else is left as it was,
 * because the POS screens (menu, tables, orders, settings, reports) are used by roles that have no
 * entry for the admin resources. Reads are only checked for the admin-only areas; for the shared
 * lists (categories, discounts, suppliers, branches, ...) only changes are checked.
 *
 * Switch off with the environment variable API_PERMISSIONS=off.
 */

export type PermAction = "create" | "read" | "update" | "delete";

interface Rule {
  /** Matches the start of the path, on a segment boundary. */
  prefix: string;
  /** The role needs ANY of these resources to hold the action. */
  resources: string[];
  /** Also check GET (otherwise only POST / PUT / DELETE are checked). */
  reads?: boolean;
  /** The action to hold, when the method doesn't say it (e.g. a POST that changes an order). */
  action?: PermAction;
  /** Sub-paths that are not covered by this rule. */
  except?: string[];
}

// Longest prefix wins, so a specific rule can override a general one.
export const RULES: Rule[] = [
  // people and access
  {
    prefix: "/api/user/role",
    resources: ["role", "accessibility"],
  },
  {
    prefix: "/api/user",
    resources: ["users"],
    reads: true,
    except: [
      "/api/user/me",
      "/api/user/has-user",
      "/api/user/first-user",
      "/api/user/bind-user",
      "/api/user/default-admin",
      "/api/user/change-password",
      "/api/user/role",
    ],
  },
  { prefix: "/api/warehouse-v2", resources: ["warehouse"] },
  { prefix: "/api/warehouse/slot", resources: ["slot"] },
  { prefix: "/api/setup", resources: ["setting"] },
  { prefix: "/api/warehouse/setting", resources: ["setting"] },

  // stock
  { prefix: "/api/purchase-order", resources: ["purchase-order"], reads: true },
  { prefix: "/api/replenishment", resources: ["replenishment"], reads: true },
  { prefix: "/api/composition", resources: ["production"] },
  { prefix: "/api/inventory/count-stock", resources: ["stock-counting"] },
  {
    prefix: "/api/inventory",
    resources: ["stock-counting", "product", "transfer", "transaction"],
  },

  // catalogue (changes only: the lists are read by the POS)
  { prefix: "/api/supplier", resources: ["supplier"] },
  { prefix: "/api/category/product-toggle", resources: ["category", "product"] },
  { prefix: "/api/category", resources: ["category"] },
  { prefix: "/api/modifier", resources: ["modifier"] },
  { prefix: "/api/discount", resources: ["discount"] },
  { prefix: "/api/promotion-set", resources: ["discount"] },
  { prefix: "/api/payment/method", resources: ["payment"] },
  // opening and closing a shift (POST) needs the shift permission; the branch's shift is shared by everyone
  { prefix: "/api/shift", resources: ["shift"] },
  { prefix: "/api/product-v2/group", resources: ["product-group", "product"] },
  { prefix: "/api/product-v2", resources: ["product"] },
  { prefix: "/api/table", resources: ["table", "restaurant"] },
  { prefix: "/api/table-change", resources: ["restaurant"], action: "update" },
  { prefix: "/api/transfer-table", resources: ["restaurant"], action: "update" },
  // resending a ticket, or the printer test in settings
  { prefix: "/api/print-queue", resources: ["order-preparation", "restaurant", "setting"], action: "update" },

  // cinema
  { prefix: "/api/cinema/showtime", resources: ["showtime"] },
  { prefix: "/api/cinema/hall", resources: ["hall-seat"] },
  { prefix: "/api/cinema/pricing-template", resources: ["pricing-template"] },
  { prefix: "/api/cinema/settlement", resources: ["settlement"], reads: true },
  { prefix: "/api/cinema/ticket-order", resources: ["ticket"] },
  { prefix: "/api/cinema/reservation", resources: ["ticket", "digital"] },
];

const METHOD_ACTION: Record<string, PermAction> = {
  GET: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix + "/");

/** What the role must be allowed to do for this request, or null when the route is not checked. */
export function requiredPermission(
  pathname: string,
  method: string,
): { resources: string[]; action: PermAction } | null {
  const action = METHOD_ACTION[method.toUpperCase()];
  if (!action) return null;
  const path = pathname.replace(/\/+$/, "");

  const rule = RULES.filter((r) => under(path, r.prefix))
    .filter((r) => !(r.except ?? []).some((e) => under(path, e)))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!rule) return null;
  if (action === "read" && !rule.reads) return null;
  return { resources: rule.resources, action: action === "read" ? action : (rule.action ?? action) };
}

/** The role's permissions as { resource: ["read", ...] }; the column may hold JSON text or an object. */
export function parsePermissions(raw: unknown): Record<string, string[]> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [resource, list] of Object.entries(value as Record<string, unknown>)) {
    const items = Array.isArray(list) ? list.map(String) : String(list ?? "").split(",");
    out[resource] = items.map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** OWNER may do everything; otherwise the role must list the action for one of the resources ("view-only" counts as read). */
export function isPermitted(
  role: { role?: string; permissions?: unknown } | undefined | null,
  required: { resources: string[]; action: PermAction },
): boolean {
  if (!role) return false;
  if (role.role === "OWNER") return true;
  const perms = parsePermissions(role.permissions);
  return required.resources.some((resource) => {
    const list = perms[resource] ?? [];
    if (required.action === "read" && list.includes("view-only")) return true;
    return list.includes(required.action);
  });
}
