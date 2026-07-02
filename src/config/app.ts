export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? process.env.APP_NAME ?? "Central dos Planos",
  shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? process.env.APP_SHORT_NAME ?? "Central",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? process.env.APP_TAGLINE ?? "dos Planos",
  version: process.env.APP_VERSION ?? "1.0.0",
  license: process.env.APP_LICENSE ?? "MIT",
  developer: process.env.APP_DEVELOPER ?? "PERAXIS Desenvolvimento",
  defaultPageSize: 20,
};
