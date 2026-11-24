// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_modifier_items } from "../../generated/tables";
import { Formatter } from "../../lib/formatter";
import { generateId } from "../../lib/generate-id";
import { planModifierItems } from "../../lib/modifier-items";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { inputModifierType, modifierSchema } from "./create-modifier";

export const updateModifier = withAuthApi<
  inputModifierType,
  unknown,
  ResponseType<boolean>
>(async ({ db, userAuth, body }) => {
  const input = modifierSchema.parse(body);
  const user = userAuth.admin!;

  const id = input.id ?? "";

  const res = await db.tx(async (trx) => {
    await trx
      .table("modifier")
      .update({
        title: input.title,
        description: input.description,
        update_at: Formatter.getNowDateTime(),
        updated_by: user.id,
      })
      .where({ modifier_id: id });

    // What the form sent decides what happens to each option (see planModifierItems): one that arrives with the id of a
    // current option is updated in place; one without an id (or with an id this modifier does not have) is new; a
    // current option that did not arrive is removed. (This used to be the other way round: every edit removed all the
    // options and added them again with new ids, and a new option without an id was never saved.)
    const current: { id: string }[] = await trx.rows("modifier_items", { AND: [{ modifier_id: id }, { deleted_at: null }] }, { select: ["id"] });
    const plan = planModifierItems(
      current.map((c) => c.id),
      input.items
    );

    // remove the options that were taken out
    const keep = plan.update.map((x) => x.id);
    const removing = trx
      .table("modifier_items")
      .where({ modifier_id: id })
      .whereNull("deleted_at");
    if (keep.length > 0) removing.whereNotIn("id", keep);
    await removing.update({
      deleted_at: Formatter.getNowDateTime(),
      deleted_by: user.id,
      updated_at: Formatter.getNowDateTime(),
      updated_by: user.id,
    });

    // new options
    if (plan.insert.length > 0) {
      const added: table_modifier_items[] = plan.insert.map((x) => ({
        id: generateId(),
        modifier_id: id,
        name: x.name,
        price: String(x.price || 0),
        created_at: Formatter.getNowDateTime(),
        created_by: user.id,
        updated_at: null,
        updated_by: null,
        deleted_by: null,
        deleted_at: null,
      }));
      await trx.insert("modifier_items", added);
    }

    // options that stay
    for (const x of plan.update) {
      await trx.update("modifier_items", { id: x.id }, {
        name: x.name,
        price: String(x.price || 0),
        updated_at: Formatter.getNowDateTime(),
        updated_by: user.id,
      });
    }

    return true;
  });

  return NextResponse.json(
    {
      success: res ? true : false,
      result: res ? true : false,
    },
    { status: res ? 200 : 500 }
  );
});
