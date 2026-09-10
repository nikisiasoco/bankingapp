import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The same root .env the npm scripts pass with --env-file-if-exists.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
