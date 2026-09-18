import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getApiProxyTarget } from './vite.config.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Vite API proxy configuration', () => {
  it('loads VITE_API_PROXY_TARGET from .env.local for the active mode', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'testopia-vite-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, '.env'), 'VITE_API_PROXY_TARGET=http://env.example\n');
    await writeFile(join(directory, '.env.local'), 'VITE_API_PROXY_TARGET=http://local.example\n');

    expect(getApiProxyTarget('development', directory)).toBe('http://local.example');
  });
});
