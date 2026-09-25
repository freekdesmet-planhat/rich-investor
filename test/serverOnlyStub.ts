// Empty stub so Vitest can import modules that guard themselves with the
// `server-only` package. In the app that package throws when pulled into a
// client bundle; under test there is no bundler boundary, so it is a no-op.
export {};
