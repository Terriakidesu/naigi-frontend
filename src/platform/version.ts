declare const __FRONTEND_VERSION__: string;

export const clientVersion = typeof __FRONTEND_VERSION__ === "undefined"
  ? "development"
  : __FRONTEND_VERSION__;
