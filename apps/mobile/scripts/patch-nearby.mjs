/**
 * expo-nearby-connections@1.1.0 ships a broken android/build.gradle:
 *   1. it `apply from: './fix-prefab.gradle'` but doesn't include that file
 *      in the npm tarball → "Could not read script … fix-prefab.gradle".
 *   2. it has a library self-publishing block (`from components.release`) that
 *      newer Gradle rejects when the module is consumed by an app
 *      → "SoftwareComponent with name 'release' not found".
 *
 * Both are irrelevant to consuming the module in an app. This postinstall
 * patch stubs the missing file and strips the publishing block. Idempotent —
 * safe to re-run after every `bun install`. (patch-package can't be used here
 * because it doesn't understand bun.lock.)
 */
import fs from "node:fs"
import path from "node:path"

const dir = path.join(process.cwd(), "node_modules", "expo-nearby-connections", "android")
if (!fs.existsSync(dir)) process.exit(0)

const stub = path.join(dir, "fix-prefab.gradle")
if (!fs.existsSync(stub)) {
  fs.writeFileSync(
    stub,
    "// Stub — the published tarball references this file but doesn't ship it.\n" +
      "// prefab is already enabled (buildFeatures { prefab true }); nothing to fix up.\n",
  )
  console.log("[patch-nearby] wrote fix-prefab.gradle stub")
}

const bg = path.join(dir, "build.gradle")
let s = fs.readFileSync(bg, "utf8")
const block = `afterEvaluate {
  publishing {
    publications {
      release(MavenPublication) {
        from components.release
      }
    }
    repositories {
      maven {
        url = mavenLocal().url
      }
    }
  }
}
`
if (s.includes(block)) {
  s = s.replace(block, "// [patched] removed maven-publish block (components.release)\n")
  s = s.replace("apply plugin: 'maven-publish'\n", "")
  fs.writeFileSync(bg, s)
  console.log("[patch-nearby] stripped publishing block from build.gradle")
}
