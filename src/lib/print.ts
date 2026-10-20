import * as Print from 'expo-print';
import { loadDevice } from './device';
import { receiptJob, sendJob } from './print-server';

export type PrintedVia = 'server' | 'phone';

/**
 * Prints a receipt the way this phone is set up (Profile > Print & Device Settings): sent to the print server's
 * printer when the method is "Print server" and a printer is chosen, otherwise the phone's print dialog (also the
 * fallback when no printer is chosen, like the web, which says so). Throws with a short reason when the print
 * server cannot be reached; the server does not confirm the paper came out.
 */
export async function printReceipt(html: string): Promise<{ via: PrintedVia; noPrinter: boolean }> {
  const device = await loadDevice();
  if (device.method === 'print_server' && device.printer.trim()) {
    const result = await sendJob(device.printUrl, receiptJob(html, device.printer.trim()));
    if (!result.ok) throw new Error(result.message);
    return { via: 'server', noPrinter: false };
  }
  await Print.printAsync({ html });
  return { via: 'phone', noPrinter: device.method === 'print_server' };
}
