/** A row of the kh-pos `setting` table: option name and a text value, per branch or for every branch. */
export interface SettingRow {
  id: number;
  option: string | null;
  value: string | null;
  /** Branch id, or null for the setting every branch shares. */
  warehouse: string | null;
}
