// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SETUP_OPTION } from "./setup";
import {
  table_payment_method,
  table_setting,
  table_warehouse,
} from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { generateId } from "../lib/generate-id";
import type { Db } from "../db/db";
import { CustomerService } from "./customer";
import { SlotService } from "./slot";
import { UserService } from "./user";
import { UserRole } from "./user-role";
interface WarehouseProps {
  warehouseName: string;
  phoneNumber?: string;
  address?: string;
  ownerName: string;
  userName: string;
  password: string;
  createdBy?: string;
  isMain?: boolean; // only first user can create main warehouse
  image?: string;
  lat?: string;
  lng?: string;
  useMainBranchVisibility?: boolean;
}

export interface UpdateWarehouseProps extends Omit<
  WarehouseProps,
  "userName" | "password"
> {
  id: string;
}

export interface WarehouseV2ResponseType {
  id?: string;
  name: string;
  isMain: boolean;
  createdAt?: string;
  updatedAt?: string;
  phoneNumber?: string;
  address?: string;
  ownerName?: string;
  image?: string;
  lat?: string;
  lng?: string;
  useMainBranchVisibility?: boolean;
}

export class WarehouseService {
  constructor(protected tx: Db) {}

  async createWarehouse({
    warehouseName,
    phoneNumber,
    address,
    ownerName,
    userName,
    password,
    createdBy,
    isMain,
    image,
    lat,
    lng,
    useMainBranchVisibility,
  }: WarehouseProps) {
    return await this.tx.tx(async (tx) => {
      const now = Formatter.getNowDateTime();
      const warehouseId = generateId();
      const userId = generateId();
      const userDevId = generateId();
      createdBy = createdBy || userId;

      // Insert warehouse data
      await tx.insert("warehouse", {
        id: warehouseId,
        name: warehouseName,
        phone: phoneNumber,
        address,
        owner_name: ownerName,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
        is_main: isMain ? 1 : 0,
        image: image || null,
        lat: lat || null,
        lng: lng || null,
        use_main_branch_visibility: useMainBranchVisibility ? 1 : 0,
      });

      // create default slot for pos
      const slotService = new SlotService(tx);
      await slotService.createSlot({
        slotName: "POS",
        warehouseId,
        createdBy,
        posSlot: true,
      });

      // create warehouse admin user
      const userService = new UserService(tx);
      const roleService = new UserRole(tx);
      const defaultRole = await roleService.getDefaultRole();

      await userService.createUser({
        id: userId,
        username: userName,
        password,
        warehouseId,
        createdBy,
        fullName: ownerName,
        phoneNumber,
        roleId: defaultRole.id!,
      });

      // create system admin
      await userService.createUser({
        id: generateId(),
        username: generateId().slice(0, 8),
        password,
        warehouseId,
        createdBy,
        fullName: "System Admin",
        phoneNumber: generateId().slice(0, 8),
        roleId: defaultRole.id!,
        isSystemAdmin: true,
      });

      // create dev user
      const devUser = await tx.row("user", { is_dev: true });

      if (!devUser) {
        await userService.createUser({
          id: userDevId,
          username: "dev",
          password: "123456",
          warehouseId,
          createdBy,
          fullName: "Developer",
          phoneNumber: generateId().slice(0, 8),
          roleId: defaultRole.id!,
          isDev: true,
          isSystemAdmin: true,
        });
      }

      // create default walk-in customer
      const customerService = new CustomerService(tx);
      await customerService.createCustomer({
        customerName: "Walk In",
        phoneNumber: "",
        address: "",
        warehouseId,
        createdBy,
        type: "general",
        extraPrice: 0,
      });

      // create default setting
      const listSection = [
        { value: "main-dining", label: "Main Dining" },
        { value: "patio", label: "Patio" },
        { value: "bar-area", label: "Bar Area" },
        { value: "private-dining", label: "Private Dining" },
        { value: "terrace", label: "Terrace" },
        { value: "vip", label: "VIP Section" },
      ];

      const listShape = [
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
        { value: "rectangle", label: "Rectangle" },
      ];

      let settingList: table_setting[] = [
        {
          warehouse: warehouseId,
          option: "QR_CODE",
          value: "",
        },
        {
          warehouse: warehouseId,
          option: "TABLE_SELECTION",
          value: JSON.stringify(listSection),
        },
        {
          warehouse: warehouseId,
          option: "TABLE_SHAPE",
          value: JSON.stringify(listShape),
        },
        {
          warehouse: warehouseId,
          option: "INVOICE_RECEIPT",
          value: "default, , ,0 0 0 0,0,0,0",
          // default,Fun Beerking,https://s9.kh1.co/34cfbccd4ed803a16882c3b57bf84b98.png,0 0 0 1,0,1
        },

        {
          option: "PRINT_SERVER",
          warehouse: warehouseId,
          value: JSON.stringify({
            printers: [
              {
                id: "1",
                name: "Cashier Printer",
                printer_name: "XP-80C",
                ip: "127.0.0.1",
                port: 9100,
              },
            ],
            print_server_ip: "192.168.1.100:8080",
            group_by: "ITEM",
          }),
        },
        {
          warehouse: warehouseId,
          option: "LABEL_PRINT",
          value: JSON.stringify({
            paperSize: {
              width: 45,
              height: 30,
              padding: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
            price: true,
            barcode: {
              displayValue: true,
              width: 2,
              height: 60,
            },
          }),
        },
        {
          warehouse: warehouseId,
          option: "TYPE_POS",
          value: JSON.stringify({
            system_type: "MART",
            shared_order_draft: false,
          }),
        },
        {
          warehouse: warehouseId,
          option: "ACCESSIBILITY",
          value: "",
        },
        {
          warehouse: warehouseId,
          option: "PRODUCT_MENU",
          value: JSON.stringify({
            onlyForSale: true,
            onlyInStock: true,
          }),
        },
        {
          warehouse: warehouseId,
          option: "ORDER_DISCOUNT_RULES",
          value: JSON.stringify({
            amountRule: {
              enabled: false,
              minAmount: 100,
              discountType: "PERCENTAGE",
              value: 0,
            },
            qtyRule: {
              enabled: false,
              minQty: 50,
              discountType: "PERCENTAGE",
              value: 0,
            },
            maxQtyPerLine: { enabled: true, value: 3, countBy: "VARIANT" },
          }),
        },
        {
          warehouse: warehouseId,
          option: "RTB",
          value: "",
        },
      ];

      // default exchange rate for main warehouse
      if (isMain) {
        settingList.push(
          // locks selling until the owner finishes the first-time setup
          { warehouse: warehouseId, option: SETUP_OPTION, value: JSON.stringify({ confirmed: [] }) },
          {
            warehouse: null,
            option: "EXPIRY_SETTING",
            value: JSON.stringify({
              urgent: 5,
              critical: 7,
              warning: 30,
            }),
          },
          {
            warehouse: null,
            option: "EDITABLE_ORDER_DAY",
            value: "1",
          },
          {
            warehouse: null,
            option: "EXCHANGE_RATE",
            value: "4000",
          },
          {
            warehouse: null,
            option: "CURRENCY",
            value: "USD",
          },
          {
            warehouse: null,
            option: "ACCOUNTING",
            value: "0",
          },
          {
            warehouse: null,
            option: "BRAND_INTEGRATION",
            value: "",
          },
          {
            warehouse: null,
            option: "INVENTORY",
            value: JSON.stringify({
              restrict_product_lot: true,
            }),
          },
          {
            warehouse: null,
            option: "BRAND",
            value: JSON.stringify({
              title: "Point of Sale (POS) System",
              description:
                "POS powered by BongIT. POS stands for Point of Sale, which refers to the place and system where a retail transaction is completed. It typically involves both hardware and software used by businesses to process sales, accept payments, and manage related operations like inventory and customer data.",
              icons: {
                icon: "/favicon.ico",
              },
            }),
          },
        );
      }

      // check if have main warehouse
      const mainWarehouse = await tx.row<table_warehouse>("warehouse", { AND: [{ is_main: 1 }, { is_deleted: 0 }] });

      if (mainWarehouse) {
        const settingMainWarehouse = await tx.rows<table_setting>("setting", { warehouse: mainWarehouse.id });

        if (settingMainWarehouse.length > 0) {
          settingList = settingMainWarehouse.filter((s) => s.option !== SETUP_OPTION).map((setting) => {
            return {
              warehouse: warehouseId,
              option: setting.option,
              value: setting.value,
            };
          });
        }
      }

      await tx.insert("setting", settingList);

      if (isMain) {
        // add payment method
        await tx.insert("payment_method", [
          {
            method_id: "1",
            method: "CASH",
            created_by: createdBy,
            created_at: now,
            updated_at: now,
          },
          {
            method_id: "2",
            method: "ABA Bank",
            created_by: createdBy,
            created_at: now,
            updated_at: now,
          },
        ]);
      }

      return warehouseId;
    });
  }

  async getWarehouse(
    limit: number = 30,
    offset: number = 0,
    id?: string[],
  ): Promise<{ data: WarehouseV2ResponseType[]; total: number }> {
    const query = this.tx
      .table<table_warehouse>("warehouse")
      .where("is_deleted", false);

    if (id) {
      query.whereIn("id", id);
    }

    const { total } = await query
      .clone()
      .count("* as total")
      .first<{ total: number }>();

    const warehouse = await query
      .clone()
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
    const data = warehouse.map((x) => {
      return {
        id: x.id || "",
        name: x.name || "",
        isMain: Boolean(x.is_main) || false,
        createdAt: x.created_at || "",
        updatedAt: x.updated_at || "",
        phoneNumber: x.phone || "",
        address: x.address || "",
        ownerName: x.owner_name || "",
        image: x.image || "",
        lat: x.lat || "",
        lng: x.lng || "",
        useMainBranchVisibility: Boolean(x.use_main_branch_visibility) || false,
      };
    });

    return {
      data,
      total,
    };
  }

  async deleteWarehouse(id: string) {
    return await this.tx.tx(async (tx) => {
      const warehouse = await tx.row<table_warehouse>("warehouse", { id: id });
      if (warehouse && warehouse.is_main) {
        throw new Error("Main warehouse cannot be deleted");
      }

      // mark warehouse as deleted
      await tx.update("warehouse", { id: id }, { is_deleted: 1 });

      // mark slots of warehouse as deleted
      const slotService = new SlotService(tx);
      await slotService.deleteSlotByWarehouseId(id);

      // mark users of warehouse as deleted
      const userService = new UserService(tx);
      await userService.deleteUserByWarehouseId(id);
      return true;
    });
  }

  async updateWarehouse({
    id,
    warehouseName,
    ownerName,
    phoneNumber,
    address,
    createdBy,
    image,
    lat,
    lng,
    useMainBranchVisibility,
  }: UpdateWarehouseProps) {
    const now = Formatter.getNowDateTime();
    await this.tx.update("warehouse", { id: id }, {
        name: warehouseName,
        phone: phoneNumber,
        address,
        owner_name: ownerName,
        updated_by: createdBy,
        updated_at: now,
        image: image || null,
        lat: lat || null,
        lng: lng || null,
        use_main_branch_visibility: useMainBranchVisibility ? 1 : 0,
      });
    return true;
  }
}
