import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cleanSettingValue, currencyOptions, displayValue, effectiveSettings, optionLabel, previewValue, settingKind, type SettingRow } from '@/lib/settings-admin';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

interface SettingForm {
  id: string;
  option: string;
  value: string;
  [key: string]: unknown;
}

/**
 * The kh-pos settings (currency, exchange rate, table sections, discount rules, receipt template, ...)
 * for this branch. Currency and exchange rate have their own editors; settings that hold JSON are
 * checked before saving so a typo can't break the app.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const warehouseId = user?.currentWarehouseId ?? '';
  const config = useMemo<EntityConfig<SettingRow, SettingForm>>(
    () => ({
      title: t('more.settings'),
      resource: 'setting',
      cacheKey: 'settings-admin',
      load: async () => effectiveSettings((await api.call<{ result?: SettingRow[] }>('GET', `/api/setting?warehouseId=${encodeURIComponent(warehouseId)}`)).result ?? [], warehouseId),
      rowKey: (r) => String(r.id),
      rowTitle: (r) => optionLabel(r.option),
      rowSubtitle: (r) => previewValue(r.value),
      searchText: (r) => `${r.option} ${r.value ?? ''}`,
      emptyForm: () => ({ id: '', option: '', value: '' }),
      toForm: (r) => ({ id: String(r.id), option: r.option ?? '', value: displayValue(settingKind(r.option, r.value), r.value) }),
      fields: [
        { key: 'value', label: t('settings.value'), kind: 'select', options: currencyOptions(), visible: (f) => settingKind(f.option, f.value) === 'currency' },
        { key: 'value', label: t('settings.value'), kind: 'multiline', visible: (f) => settingKind(f.option, f.value) !== 'currency' },
      ],
      validate: (f) => (cleanSettingValue(settingKind(f.option, f.value), f.value) === null ? 'value' : null),
      update: (r, f) => api.call('PUT', '/api/setting', { id: r.id, option: r.option ?? undefined, value: cleanSettingValue(settingKind(f.option, f.value), f.value) ?? f.value }),
    }),
    [api, t, warehouseId],
  );
  return <EntityScreen config={config} />;
}
