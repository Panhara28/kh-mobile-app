import * as Print from 'expo-print';

/** Prints a receipt through the phone's print dialog (AirPrint, or a printer app on Android). */
export async function printReceipt(html: string): Promise<void> {
  await Print.printAsync({ html });
}
