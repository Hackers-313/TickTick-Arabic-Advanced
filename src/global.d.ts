export {};

declare global {
  interface Window {
    api: {
      invoke: (method: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
      platform: string;
    };
  }
}
