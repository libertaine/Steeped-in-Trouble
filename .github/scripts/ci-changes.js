// Unknown paths and unavailable change bases always run runtime checks.
/* global process, console */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function documentationOnly(paths) {
  return paths.length > 0 && paths.every(path =>
    /^(README|CHANGELOG|CONTRIBUTING|DEVELOPMENT)\.md$/.test(path)
    || /^docs\/(?!reference\/).*\.md$/.test(path)
    || /^docs\/images\/.*\.(png|jpg|jpeg|gif|webp)$/.test(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let docsOnly = false;
  const base = process.env.CHANGE_BASE;
  if (base && !/^0+$/.test(base)) {
    try {
      // Include both paths of renames so moving runtime files into docs runs checks.
      const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' })
        .split('\0').filter(Boolean);
      docsOnly = documentationOnly(paths);
    } catch {
      console.log('Change base unavailable; running all fast checks.');
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, docsOnly
    ? 'Documentation only: test execution skipped; compatible check jobs complete successfully.\n'
    : 'Runtime, test, configuration, or unknown changes: running fast validation.\n');
}
