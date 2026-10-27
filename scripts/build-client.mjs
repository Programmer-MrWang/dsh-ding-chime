/**
 * Inline the locale dictionaries into `lib/client.js`.
 *
 * The browser artifact is a single self-contained module: it cannot `require`
 * a sibling JSON file at runtime, so the dictionaries it registers with
 * `ctx.locale` must be embedded in the module body. `locale/*.json` stays the
 * source of truth (the Plugin Manager also reads `meta` from there), and this
 * script copies the content into the marked region of `client.js`.
 *
 * Usage:
 *   node scripts/build-client.mjs           # rewrite the region
 *   node scripts/build-client.mjs --check   # fail if the region is stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLIENT = `${ROOT}lib/client.js`
const START = '    // <locale-dicts>'
const END = '    // </locale-dicts>'
/** Locales embedded into the module, in file-name order. */
const LOCALES = ['zh', 'en']

const dictionaries = LOCALES.map((locale) => {
  const path = `${ROOT}locale/${locale}.json`
  const data = JSON.parse(readFileSync(path, 'utf8'))
  // `meta` is Plugin Manager inventory text, not page copy.
  delete data.meta
  return [locale, data]
})

const body = dictionaries
  .map(([locale, dict]) => `      ${locale}: ${JSON.stringify(dict, null, 2).replace(/\n/g, '\n      ')},`)
  .join('\n')

const block = `${START}\n    const DICTS = {\n${body}\n    }\n${END}`

const source = readFileSync(CLIENT, 'utf8')
const start = source.indexOf(START)
const end = source.indexOf(END)
if (start === -1 || end === -1 || end < start) {
  console.error('client.js is missing the locale-dicts markers')
  process.exit(1)
}

const next = source.slice(0, start) + block + source.slice(end + END.length)

if (process.argv.includes('--check')) {
  if (next !== source) {
    console.error('client.js locale block is stale; run: node scripts/build-client.mjs')
    process.exit(1)
  }
  console.log('client locale block is up to date')
  process.exit(0)
}

writeFileSync(CLIENT, next)
console.log(`inlined ${dictionaries.length} locales into lib/client.js`)
