// jsdom polyfills for libraries used by the components under test.

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
