export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? process.env.APP_NAME ?? "Click Hubnet",
  shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? process.env.APP_SHORT_NAME ?? "Click Hubnet",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? process.env.APP_TAGLINE ?? "Painel comercial",
  version: process.env.APP_VERSION ?? "1.0.0",
  license: process.env.APP_LICENSE ?? "MIT",
  developer: process.env.APP_DEVELOPER ?? "PERAXIS Desenvolvimento",
  defaultPageSize: 20,
};
