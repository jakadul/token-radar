// The token-radar-01 entry: one sealed snapshot in, one ranked board and one dashboard out.
//
// It reads the snapshot (--input <file|dir>, /input/snapshot.json by default), scores every pre-token
// protocol with the comparables model in lib/model.ts, writes the ranked board to <out>/board.json and
// the dashboard's data to <out>/data.js, copies this repository's dashboard/ and screenshots/ into
// <out>, and finally writes <out>/dossier.json, the summary the judge reads, with the vendored
// make.fun library in vendor/makefun-board.ts.
//
// The refuse-first checks are deliberate: a board that misses a watchlist slug, ties every row on one
// value, or carries a farm step outside the gate's 20..600 characters is worse than no run, so the
// run stops and says which rule broke rather than writing something the gate will throw away.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Where this file lives: dashboard/ and screenshots/ are read from beside it, never from the cwd. */
const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier's bytes, the rest refuse an entry. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const MIN_SHOTS = 3;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** The snapshot path: an explicit .json file, or snapshot.json inside the directory given. */
function snapshotPath(inputArg: string): string {
  return inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
}

/** Stop the run with one sentence: a board the gate would refuse is not worth writing. */
function stop(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputFile = snapshotPath(arg('input', '/input'));
if (!existsSync(inputFile)) {
  stop(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) stop(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The images the dossier must hold: at least three, each a regular file named within the caps. */
function checkShots(names: string[]): string[] {
  if (names.length < MIN_SHOTS) {
    stop(`screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in ${MIN_SHOTS}, the board, a detail view and a filtered view`);
  }
  for (const name of names) {
    if (!IMAGE_NAME.test(name)) stop(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
  return names;
}

const dashboard = join(here, 'dashboard');
const screenshots = join(here, 'screenshots');
copyFiles(dashboard, join(out, 'dashboard'));
const shots = checkShots(copyFiles(screenshots, join(out, 'screenshots')));

// The dossier is written last: the scorer rebuilds it from this /output and compares the bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside, ${radar.comparables_size} comparables)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${readdirSync(dashboard).length} files), ` +
    `${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
