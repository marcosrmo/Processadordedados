import { EventEmitter } from "events";

export interface ProgressEvent {
  type: "start" | "sheet" | "row" | "batch" | "done" | "error";
  fileId: string;
  fileName: string;
  message: string;
  currentRow?: number;
  totalRows?: number;
  currentSheet?: string;
  sheetIndex?: number;
  totalSheets?: number;
  insertedTotal?: number;
  percent?: number;
}

class ProgressBus extends EventEmitter {
  private listeners = new Map<string, ((event: ProgressEvent) => void)[]>();

  emit(eventName: string | symbol, ...args: any[]): boolean {
    return super.emit(eventName, ...args);
  }

  subscribe(fileId: string, cb: (event: ProgressEvent) => void) {
    if (!this.listeners.has(fileId)) {
      this.listeners.set(fileId, []);
    }
    this.listeners.get(fileId)!.push(cb);
    this.on(`progress:${fileId}`, cb);
  }

  unsubscribe(fileId: string, cb: (event: ProgressEvent) => void) {
    this.off(`progress:${fileId}`, cb);
    const arr = this.listeners.get(fileId);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  publish(event: ProgressEvent) {
    this.emit(`progress:${event.fileId}`, event);
  }
}

export const progressBus = new ProgressBus();
