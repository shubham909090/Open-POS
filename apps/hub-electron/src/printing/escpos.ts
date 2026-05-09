import net from "node:net";

export interface PrinterAdapter {
  print(host: string, port: number, payload: string): Promise<void>;
}

export class DryRunPrinterAdapter implements PrinterAdapter {
  readonly printed: Array<{ host: string; port: number; payload: string }> = [];

  async print(host: string, port: number, payload: string): Promise<void> {
    this.printed.push({ host, port, payload });
  }
}

export class LanEscposPrinterAdapter implements PrinterAdapter {
  async print(host: string, port: number, payload: string): Promise<void> {
    const data = Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      Buffer.from(payload, "utf8"),
      Buffer.from([0x1d, 0x56, 0x00])
    ]);

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port, timeout: 5_000 }, () => {
        socket.write(data, (error) => {
          if (error) {
            reject(error);
            return;
          }
          socket.end();
        });
      });

      socket.on("close", () => resolve());
      socket.on("timeout", () => {
        socket.destroy(new Error(`Printer ${host}:${port} timed out`));
      });
      socket.on("error", reject);
    });
  }
}
