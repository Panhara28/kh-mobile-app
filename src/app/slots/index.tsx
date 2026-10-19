import { useSession } from '@/lib/session';
import { SlotsView } from '@/ui/slots-view';

/** Slot like the kh-pos web menu item: the stock slots of the branch you are working in. */
export default function SlotsScreen() {
  const { user } = useSession();
  return <SlotsView warehouseId={user?.currentWarehouseId ?? ''} />;
}
