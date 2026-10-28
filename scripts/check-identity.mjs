/**
 * Verify the package identity is consistent everywhere it matters.
 *
 * The npm name appeared in four places that must agree, and a mismatch is
 * silent: the plugin installs, then the browser half or the Loader specifier
 * fails to resolve. This check fails the build instead.
 *
 * Run with: node scripts/check-identity.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const problems = []
const notes = []

const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'))
const name = pkg.name
notes.push(`package name: ${name}`)

/** Assert a condition, recording a readable failure. */
function check(ok, message) {
  if (!ok) problems.push(message)
}

// 1) cordis.patch.yml must load the published name, while the row id stays
//    stable so existing installations keep their saved settings.
const patch = readFileSync(`${ROOT}cordis.patch.yml`, 'utf8')
const specifier = patch.match(/^\s*name:\s*(\S+)\s*$/m)?.[1]
const rowId = patch.match(/^\s*-\s*id:\s*(\S+)\s*$/m)?.[1] ?? patch.match(/^\s*id:\s*(\S+)\s*$/m)?.[1]
check(specifier === name, `cordis.patch.yml specifier is "${specifier}", expected "${name}"`)
check(Boolean(rowId), 'cordis.patch.yml has no row id')
notes.push(`patch row id: ${rowId}`)

// 2) The plugin's own name export must match the package.
const host = readFileSync(`${ROOT}lib/index.js`, 'utf8')
const exportedName = host.match(/export const name = '([^']+)'/)?.[1]
check(exportedName === name, `lib/index.js exports name "${exportedName}", expected "${name}"`)

// 3) The client module id must equal the package name: the module table keys
//    the browser half by it.
const client = readFileSync(`${ROOT}lib/client.js`, 'utf8')
const clientId = client.match(/__ModuleLoader__\.load\(\{\s*\n?\s*id: '([^']+)'/)?.[1]
check(clientId === name, `lib/client.js registers id "${clientId}", expected "${name}"`)

// 4) Files listed in package.json must exist, since a missing entry ships an
//    incomplete package that only fails after install.
const { existsSync } = await import('node:fs')
for (const entry of pkg.files ?? []) {
  // Directory entries and globs are covered by the pack check in CI.
  if (entry.includes('*')) continue
  check(existsSync(`${ROOT}${entry}`), `package.json files lists missing path: ${entry}`)
}

// 5) The route prefix and config namespace are the plugin's own keys. They are
//    allowed to differ from the package name, but they must agree in both
//    halves, or the page talks to routes the Host never served.
const hostRoute = host.match(/path: '(\/[a-z0-9-]+)'/)?.[1]
check(Boolean(hostRoute), 'lib/index.js registers no route prefix')
const hostNs = host.match(/const NS = '([^']+)'/)?.[1]
const clientNs = client.match(/const NS = '([^']+)'/)?.[1]
check(hostNs === clientNs, `namespace differs: host "${hostNs}" vs client "${clientNs}"`)
if (hostRoute) {
  const expectedPrefix = `/dsh-ding`
  check(hostRoute === expectedPrefix, `route prefix is "${hostRoute}", expected "${expectedPrefix}"`)
  check(client.includes(`${expectedPrefix}/config`), `client does not call ${expectedPrefix}/config`)
  check(client.includes(`${expectedPrefix}/preview`), `client does not call ${expectedPrefix}/preview`)
}
notes.push(`route prefix: ${hostRoute}`, `config namespace: ${hostNs}`)

for (const note of notes) console.log(`  ${note}`)
if (problems.length > 0) {
  console.error('\nidentity check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('identity check passed')
