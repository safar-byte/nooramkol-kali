// Publish dist/ to the gh-pages branch of the origin remote.
// Usage: npm run deploy  (runs the tests and the build first)

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const remote = git(['remote', 'get-url', 'origin']);
const commit = git(['rev-parse', '--short', 'HEAD']);

writeFileSync(join(dist, '.nojekyll'), '');
rmSync(join(dist, '.git'), { recursive: true, force: true });
git(['init', '-q', '-b', 'gh-pages'], dist);
git(['add', '-A'], dist);
git(['commit', '-q', '-m', `Deploy ${commit}`], dist);
execFileSync('git', ['push', '-f', remote, 'gh-pages'], { cwd: dist, stdio: 'inherit' });
rmSync(join(dist, '.git'), { recursive: true, force: true });
console.log(`Deployed ${commit} to gh-pages.`);
