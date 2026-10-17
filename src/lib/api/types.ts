/**
 * Shapes returned by the kh-pos API, copied from the kh-pos sources (names kept as-is,
 * including the server's own spellings such as `modiferAmount`). Only fields the app uses.
 */

/** Every kh-pos JSON response. Errors may also arrive with HTTP 200 and success: false. */
export interface ApiResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}

/** GET /api/auth/customer/walk-in-login (src/lib/server-functions/get-auth-from-token.ts). */
export interface CustomerInfo {
  id: string;
  name: string;
  warehouseId: string;
  isWalkin: boolean;
  tableId?: string | null;
}

/** GET /api/warehouse (src/lib/types.ts WarehouseResponseType). */
export interface Warehouse {
  id: string;
  name: string;
  lat: string | null;
  lng: string | null;
  address?: string;
}

/** GET /api/setting: key/value rows such as CURRENCY, INVOICE_RECEIPT, PRODUCT_MENU. */
export interface Setting {
  option: string;
  value: string | null;
}

/** GET /api/category/menu. */
export interface Category {
  id: string;
  title: string;
  imageUrl?: string | null;
  parentId?: string | null;
  forSaleCount?: number;
}

export interface ProductImage {
  url: string;
  productVariantId?: string | null;
  imageOrder: number | null;
}

export interface ModifierItem {
  id: string;
  modifierId: string;
  name: string;
  price?: number;
}

export interface Modifier {
  modifierId: string;
  title: string;
  description: string;
  items?: ModifierItem[];
}

export interface Variant {
  id: string;
  productId: string;
  name: string;
  price: number | null;
  /** Unit price after the variant menu discount, or null when there is none. */
  discountedPrice?: number | null;
  stock: number | null;
  visible: boolean;
}

/** GET /api/product-v2/menu: one row per variant (src/app/api/product/search-product/types.ts). */
export interface MenuProduct {
  productId: string;
  variantId: string;
  warehouseId: string;
  /** "Product (Variant)". */
  productTitle: string;
  price?: number | string;
  discountedPrice?: number | null;
  stock?: number;
  images?: ProductImage[];
  variants?: Variant[];
  modifiers?: Modifier[] | null;
  category?: { id: string; title: string } | null;
  isPopular?: boolean;
  isNew?: boolean;
  isMostOrder?: boolean;
}

/** GET /api/pos/info. */
export interface PosInfo {
  posSlotId: string;
  posCustomerId: string;
}

export type ItemStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

export interface OrderItemStatus {
  orderItemId: string;
  status: ItemStatus;
  qty: number;
}

export interface OrderLineModifier {
  orderDetailId: string;
  modifierItemId: string;
  price?: number;
  notes?: string;
}

/** One line of the table's order (src/classes/order.ts OrderDetail). */
export interface OrderLine {
  orderDetailId: string;
  variantId: string;
  title: string;
  qty: number;
  price: string;
  discountAmount: string;
  modiferAmount: string;
  totalAmount: string;
  orderModifiers?: OrderLineModifier[];
  status?: OrderItemStatus[];
}

export interface TableOrder {
  orderId: string;
  invoiceNo: number;
  orderStatus: string;
  totalAmount: string;
  items?: OrderLine[];
}

/** GET /api/table/:id: the table plus its open (DRAFT) order, if any. */
export interface Table {
  id: string;
  table_name: string;
  status: 'available' | 'order_taken' | 'cleaning';
  warehouse_id: string;
  order: TableOrder | null;
}
