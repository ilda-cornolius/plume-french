// Bundler-facing sibling of identity.dev.ts (Turbopack resolves the .js import).
// Keep in sync with identity.dev.ts. Never put a real person's identity here.

export const DEV_VIEWER = {
  sub: "user:dev",
  email: "dev@example.com",
  name: "Dev Viewer",
  teamId: 1,
  teamRole: "admin",
};
