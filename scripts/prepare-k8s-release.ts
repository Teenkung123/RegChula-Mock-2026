import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const releaseId = process.argv[2]
if (!releaseId || !/^\d+-\d+$/.test(releaseId))
  throw new Error("Expected the local startup release ID")
const directory = resolve(root, "tmp/k8s-releases", releaseId)

async function imageFor(repository: string) {
  const inspect = Bun.spawn(
    ["docker", "image", "inspect", `${repository}:local`, "--format", "{{.Id}}"],
    { stdout: "pipe", stderr: "inherit" },
  )
  const digest = (await new Response(inspect.stdout).text()).trim()
  if ((await inspect.exited) !== 0 || !/^sha256:[a-f0-9]{64}$/.test(digest))
    throw new Error(`Cannot inspect ${repository}:local`)
  // A node may retain an older :local image. A content-specific tag cannot alias that cache entry.
  const image = `${repository}:build-${digest.slice(7)}`
  const tag = Bun.spawn(["docker", "tag", digest, image], {
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await tag.exited) !== 0) throw new Error(`Cannot tag ${repository}`)
  return image
}

const api = await imageFor("regchula-api")
const web = await imageFor("regchula-web")
const staff = await imageFor("regchula-staff")
await mkdir(directory, { recursive: true })
for (const [file, expected] of [
  ["api.yaml", 1],
  ["web.yaml", 1],
  ["staff.yaml", 1],
  ["jobs.yaml", 2],
] as const) {
  const source = await readFile(resolve(root, "deploy/k8s/base", file), "utf8")
  let replacements = 0
  const rendered = source.replace(
    /image: (regchula-api|regchula-web|regchula-staff):local\b/g,
    (_match, repository: string) => {
      replacements += 1
      return `image: ${repository === "regchula-api" ? api : repository === "regchula-web" ? web : staff}`
    },
  )
  if (replacements !== expected) throw new Error(`Unexpected image declarations in ${file}`)
  await writeFile(resolve(directory, file), rendered)
}
await writeFile(resolve(directory, "release.json"), JSON.stringify({ api, web, staff }, null, 2))
console.log(`[RegChula] Prepared release ${releaseId} with content-specific image tags.`)
