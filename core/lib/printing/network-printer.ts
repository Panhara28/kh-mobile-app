// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import net from "net";

/** Raw TCP printing ("port 9100" / JetDirect), which network thermal printers accept. */
export function sendToNetworkPrinter(
  ip: string,
  port: number,
  data: Buffer,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error(`Printer ${ip}:${port} did not respond`)));
    socket.once("error", (err) => finish(new Error(`Printer ${ip}:${port}: ${err.message}`)));
    socket.connect(port, ip, () => {
      socket.end(data, () => finish());
    });
  });
}

/** Whether a printer accepts a connection, without printing anything. */
export function checkNetworkPrinter(ip: string, port: number, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: ip, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Printer ${ip}:${port} did not respond`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Printer ${ip}:${port}: ${err.message}`));
    });
  });
}
