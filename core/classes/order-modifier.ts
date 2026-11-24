// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  table_customer_order_detail,
  table_modifier_items,
  table_order_detail_modifier,
} from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import { getOrderDetail, recalculateCustomerOrder } from "./order";

export interface OrderModifierInput {
  orderDetailId: string;
  modifierItemId: string; // for custom modifier, the id = "NOTES"
  price: number;
  notes?: string;
}
export interface RemoveOrderModifier {
  orderDetailId: string;
  modifierItemId: string; // for custom modifier, the id = "NOTES"
}

export class OrderModifierService {
  constructor(protected tx: Db, protected user: UserInfo) {}

  async addOrderModifier(input: OrderModifierInput) {
    const now = Formatter.getNowDateTime();
    return this.tx.tx(async (trx) => {
      const orderItem = await trx.row<table_customer_order_detail>("customer_order_detail", { order_detail_id: input.orderDetailId });
      if (!orderItem) {
        throw new Error("Order item not found");
      }
      const appliedModifiers = await getAppliedModifiers(
        input.orderDetailId,
        trx
      );

      if (
        appliedModifiers.find(
          (d) => d.modifier_item_id === input.modifierItemId
        )
      ) {
        throw new Error("This modifier already applied to this item");
      }

      const modifierDetailInfo = await getModifierDetailById(
        input.modifierItemId,
        trx
      );

      if (!modifierDetailInfo && input.modifierItemId !== "notes") {
        throw new Error("Modifier not found");
      }

      await addOrderDetailModifier(
        {
          order_detail_id: input.orderDetailId,
          modifier_item_id: input.modifierItemId,
          price: input.price.toString(),
          notes: input.notes ?? null,
          created_at: now,
          created_by: this.user.id,
        },
        trx
      );

      // recalculate total discount and amount

      await recalculateCustomerOrder(orderItem, trx);
      return true;
    });
  }

  async removeOrderModifier(input: RemoveOrderModifier) {
    return this.tx.tx(async (trx) => {
      const orderItem = await getOrderDetail(input.orderDetailId, trx);
      if (!orderItem) {
        throw new Error("Order item not found");
      }

      await trx.del("order_detail_modifier", { AND: [{ order_detail_id: input.orderDetailId }, { modifier_item_id: input.modifierItemId }] });

      // recalculate total discount and amount
      await recalculateCustomerOrder(orderItem, trx);
      return true;
    });
  }

  async updateCustomOrderModifier(input: OrderModifierInput) {
    return this.tx.tx(async (trx) => {
      const orderItem = await getOrderDetail(input.orderDetailId, trx);
      if (!orderItem) {
        throw new Error("Order item not found");
      }
      const orderModifier = await getOrderModifier(input, trx);
      if (!orderModifier && input.modifierItemId !== "notes") {
        throw new Error("Order modifier not found");
      }

      await trx.update("order_detail_modifier", { AND: [{ order_detail_id: input.orderDetailId }, { modifier_item_id: input.modifierItemId }] }, {
          price: input.price.toString(),
          notes: input.notes,
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
        });

      await recalculateCustomerOrder(orderItem, trx);
      return true;
    });
  }
}

async function getOrderModifier(input: OrderModifierInput, trx: Db) {
  return await trx.row<table_order_detail_modifier>("order_detail_modifier", { AND: [{ order_detail_id: input.orderDetailId }, { modifier_item_id: input.modifierItemId }] });
}

export async function getAppliedModifiers(
  orderDetailId: string,
  trx: Db
): Promise<table_order_detail_modifier[]> {
  return await trx.rows<table_order_detail_modifier>("order_detail_modifier", { order_detail_id: orderDetailId });
}

async function getModifierDetailById(modifierId: string, trx: Db) {
  return await trx.row<table_modifier_items>("modifier_items", { id: modifierId });
}

async function addOrderDetailModifier(
  input: table_order_detail_modifier,
  trx: Db
) {
  await trx.insert("order_detail_modifier", input);
}

export async function applyModifierToOrderItem(
  orderItem: table_customer_order_detail,
  knex: Db
) {
  const appliedModifiers = await getAppliedModifiers(
    orderItem.order_detail_id,
    knex
  );
  const totalModifierAmount = appliedModifiers.reduce((acc, modifier) => {
    return acc + parseFloat(modifier.price || "0") * (orderItem.qty || 1);
  }, 0);

  orderItem.total_amount = (
    parseFloat(orderItem.total_amount || "0") + totalModifierAmount
  ).toString();
  orderItem.modifer_amount = totalModifierAmount.toString();
}
