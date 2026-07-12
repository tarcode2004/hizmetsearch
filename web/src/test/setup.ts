// jsdom polyfills for libraries used by the components under test.

// Some Node versions expose an incomplete built-in localStorage when no
// --localstorage-file is configured. Prefer jsdom's implementation when it is
// usable; otherwise install a deterministic in-memory Storage for tests.
if (typeof window !== "undefined" && typeof globalThis.localStorage?.getItem !== "function") {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

// framer-motion + Radix use matchMedia; jsdom doesn't provide it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Radix tooltips measure via ResizeObserver.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver =
    ResizeObserverStub;
}
