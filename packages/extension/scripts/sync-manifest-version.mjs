import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const extensionDir = path.resolve(scriptDir, '..')
const packageJsonPath = path.join(extensionDir, 'package.json')
const manifestJsonPath = path.join(extensionDir, 'manifest.json')

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const manifestJson = JSON.parse(await readFile(manifestJsonPath, 'utf8'))

if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
  throw new Error(`Invalid package version in ${packageJsonPath}`)
}

if (manifestJson.version === packageJson.version) {
  console.log(`[agrune-extension] manifest version already matches ${packageJson.version}`)
  process.exit(0)
}

const previousVersion = manifestJson.version
manifestJson.version = packageJson.version
await writeFile(manifestJsonPath, `${JSON.stringify(manifestJson, null, 2)}\n`)
console.log(
  `[agrune-extension] synced manifest version ${previousVersion} -> ${packageJson.version}`,
)
