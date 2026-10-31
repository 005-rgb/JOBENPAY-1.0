# Third-party notices

This project uses the following dependencies that are permitted under the repository policy.

## express
- License: MIT
- Source: https://github.com/expressjs/express

## cookie-parser
- License: MIT
- Source: https://github.com/expressjs/cookie-parser

## pg
- License: MIT
- Source: https://github.com/brianc/node-postgres

## zod
- License: MIT
- Source: https://github.com/colinhacks/zod

## pino
- License: MIT
- Source: https://github.com/pinojs/pino

## pino-http
- License: MIT
- Source: https://github.com/pinojs/pino-http

## helmet
- License: MIT
- Source: https://github.com/helmetjs/helmet

## React and Vite web dependencies
- `react`, `react-dom`: MIT
- `react-router-dom`: MIT
- `@tanstack/react-query`: MIT
- `i18next`, `react-i18next`: MIT
- `lucide-react`: ISC
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`: MIT
- `zod`: MIT
- `vite`, `@vitejs/plugin-react`: MIT
- `stylelint`, `stylelint-config-standard`, `eslint-plugin-react-hooks`: MIT
- `postcss-custom-media`: MIT
- `@playwright/test`: Apache-2.0
- `pixelmatch`, `pngjs`: MIT

## Additional runtime notes
- `pg-native` is not used in this project.
- `@axe-core/playwright` is not installed because its MPL-2.0 license is outside the project's allowlist. F01 uses Playwright's built-in role locators for later accessibility smoke checks instead.
