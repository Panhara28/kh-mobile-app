/**
 * The Supplier page of the kh-pos web app: a numbered list (name, contact name, consignment, phone,
 * address, notes, created date) and a form with name, contact name, contact email, contact phone,
 * address, notes and "Consignment"; delete is asked first.
 */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export interface SupplierItem {
  id: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  note?: string | null;
  isConsignment?: boolean | number | null;
  createdAt?: string | null;
}

export type SupplierFormData = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  note: string;
  isConsignment: boolean;
};

export const emptySupplierForm = (): SupplierFormData => ({ name: '', contactName: '', contactEmail: '', contactPhone: '', address: '', note: '', isConsignment: false });

export const supplierFormOf = (s: SupplierItem): SupplierFormData => ({
  name: s.name,
  contactName: text(s.contactName),
  contactEmail: text(s.contactEmail),
  contactPhone: text(s.contactPhone),
  address: text(s.address),
  note: text(s.note),
  isConsignment: !!s.isConsignment,
});

/** The web enables Submit only with a name that is not blank. */
export const supplierProblem = (f: SupplierFormData): 'name' | null => (f.name.trim() ? null : 'name');

/** The body kh-pos wants; all the contact fields are sent (empty text when left blank). */
export const supplierSaveBody = (f: SupplierFormData, existing?: SupplierItem) => ({
  ...(existing ? { id: existing.id } : {}),
  name: f.name.trim(),
  contactName: f.contactName,
  contactPhone: f.contactPhone,
  contactEmail: f.contactEmail,
  address: f.address,
  note: f.note,
  isConsignment: f.isConsignment,
});

/** Search over name, contact name, phone, email, address and notes. */
export function matchesSupplier(s: SupplierItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [s.name, s.contactName, s.contactPhone, s.contactEmail, s.address, s.note].some((v) => text(v).toLowerCase().includes(q));
}

/** "N/A" for a missing value, as the web table shows. */
export const orNA = (v: string | null | undefined) => (v && v.trim() ? v : 'N/A');

/** The date part of the stored time. */
export const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
