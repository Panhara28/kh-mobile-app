import { splitTitle } from '../menu';
import type {
  AddLinePayload,
  MoveStatusPayload,
  OutboxCommand,
  ResendPayload,
  SetGuestsPayload,
  SetOptionPayload,
  SetPendingPayload,
  SetStatusPayload,
} from './types';

const statusKey = (s: 'pending' | 'cooking' | 'served') => (s === 'pending' ? 'customize.pending' : s === 'cooking' ? 'customize.preparing' : 'customize.served');

/**
 * What a waiting change does, as a translation key and its values (for the sync list). A value
 * that starts with "customize." is itself a translation key (a status name) for the caller to translate.
 */
export function describeCommand(c: OutboxCommand): { key: string; params: Record<string, string | number> } {
  switch (c.kind) {
    case 'addLine': {
      const p = c.payload as AddLinePayload;
      return { key: 'offline.cmdAddLine', params: { qty: p.qty, name: splitTitle(p.product.productTitle).name } };
    }
    case 'setPending':
      return { key: 'offline.cmdSetPending', params: { qty: (c.payload as SetPendingPayload).qty } };
    case 'removeLine':
      return { key: 'offline.cmdRemoveLine', params: {} };
    case 'setGuests':
      return { key: 'offline.cmdSetGuests', params: { count: (c.payload as SetGuestsPayload).count } };
    case 'sendToKitchen':
      return { key: 'offline.cmdSendToKitchen', params: {} };
    case 'setStatus': {
      const p = c.payload as SetStatusPayload;
      return { key: 'offline.cmdSetStatus', params: { status: statusKey(p.status), qty: p.qty } };
    }
    case 'moveStatus': {
      const p = c.payload as MoveStatusPayload;
      return { key: 'offline.cmdMoveStatus', params: { qty: p.qty, to: statusKey(p.to) } };
    }
    case 'serveAll':
      return { key: 'offline.cmdServeAll', params: {} };
    case 'setNote':
      return { key: 'offline.cmdSetNote', params: {} };
    case 'setOption': {
      const p = c.payload as SetOptionPayload;
      return { key: p.on ? 'offline.cmdOptionOn' : 'offline.cmdOptionOff', params: { name: p.name } };
    }
    case 'setDiscount':
      return { key: 'offline.cmdSetDiscount', params: {} };
    case 'setPromotion':
      return { key: 'offline.cmdSetPromotion', params: {} };
    case 'resend':
      return { key: 'offline.cmdResend', params: { qty: (c.payload as ResendPayload).qty } };
  }
}
