import { cp } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const backendRoot = fileURLToPath(new URL('..', import.meta.url));

await cp(`${backendRoot}/src/db/migrations`, `${backendRoot}/dist/db/migrations`, {
  recursive: true,
});
