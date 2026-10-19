import { useLocalSearchParams } from 'expo-router';
import { SlotsView } from '@/ui/slots-view';

/** A branch's stock slots (opened from Branches). */
export default function BranchSlotsScreen() {
  const { warehouseId } = useLocalSearchParams<{ warehouseId: string }>();
  return <SlotsView warehouseId={warehouseId} />;
}
