import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { categoryBody, categoryForm, emptyCategory, fetchAllPages, parentOptions, type CategoryForm, type CategoryRow } from '@/lib/catalog';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

interface PrinterRow {
  id: string;
  name?: string;
  printer_name?: string;
}

/** Menu categories like the kh-pos web Category page: add, edit (parent, kitchen printer, order, extra fee) and delete. */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const printersLoad = useCachedLoad<PrinterRow[]>('printers', 'all', useCallback(async () => (await api.call<{ result?: PrinterRow[] }>('GET', '/api/printer')).result ?? [], [api]));
  const printers = printersLoad.value;

  const config = useMemo<EntityConfig<CategoryRow, CategoryForm>>(
    () => ({
      title: t('more.categories'),
      resource: 'category',
      cacheKey: 'categories',
      load: () => fetchAllPages<CategoryRow>(async (offset, limit) => (await api.call<{ result: { data: CategoryRow[]; total: number } }>('GET', `/api/category?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.title,
      rowSubtitle: (r) => [r.printer?.name, t('categories.products', { count: r.productCount ?? 0 })].filter(Boolean).join(' · '),
      rowBadge: (r) => (r.parentId ? { text: t('categories.sub') } : null),
      searchText: (r) => r.title,
      emptyForm: emptyCategory,
      toForm: categoryForm,
      fields: (rows) => [
        { key: 'title', label: t('categories.title'), kind: 'text' },
        { key: 'description', label: t('categories.description'), kind: 'multiline' },
        { key: 'parentId', label: t('categories.parent'), kind: 'select', options: parentOptions(rows, null, t('categories.none')) },
        { key: 'printerId', label: t('categories.printer'), kind: 'select', options: [{ value: '', label: t('categories.none') }, ...(printers ?? []).map((p) => ({ value: p.id, label: p.name || p.printer_name || p.id }))] },
        { key: 'sortOrder', label: t('categories.sort'), kind: 'number' },
        { key: 'excludeFeeDelivery', label: t('categories.noDeliveryFee'), kind: 'switch' },
        { key: 'markExtraFee', label: t('categories.extraFee'), kind: 'decimal' },
      ],
      validate: (f) => (f.title.trim() ? null : 'title'),
      create: (f) => api.call('POST', '/api/category', categoryBody(f)),
      update: (r, f) => api.call('PUT', '/api/category', categoryBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/category', { id: r.id }),
    }),
    [api, t, printers],
  );
  return <EntityScreen config={config} />;
}
