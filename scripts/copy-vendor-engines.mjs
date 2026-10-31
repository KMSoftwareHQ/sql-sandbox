// Copies the MariaDB WebAssembly engine (lite4mariadb) into public/vendor/ unmodified.
//
// Why not bundle it with Vite? The engine spawns its own worker threads by URL relative to its
// files, which breaks when a bundler renames or splits them. Serving the published files as-is
// keeps those URLs valid, and keeps the GPL-2.0 component and its license clearly separate.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(projectRoot, 'node_modules', 'lite4mariadb');
const targetDirectory = join(projectRoot, 'public', 'vendor', 'lite4mariadb');

rmSync(targetDirectory, { recursive: true, force: true });
mkdirSync(targetDirectory, { recursive: true });
for (const fileName of ['index.mjs', 'worker.mjs', 'worker-entry.mjs', 'lite4mariadb.js', 'lite4mariadb.wasm']) {
  cpSync(join(packageRoot, 'dist', fileName), join(targetDirectory, fileName));
}
cpSync(join(packageRoot, 'COPYING'), join(targetDirectory, 'COPYING'));
cpSync(join(packageRoot, 'package.json'), join(targetDirectory, 'package.json'));
console.log('Copied lite4mariadb into public/vendor/lite4mariadb');
