import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const releaseId = process.argv[2]
if (!releaseId || !/^\d+-\d+$/.test(releaseId))
  throw new Error("Expected the local startup release ID")
const release: { api: string; web: string } = JSON.parse(
  await readFile(
    resolve(import.meta.dir, "../tmp/k8s-releases", releaseId, "release.json"),
    "utf8",
  ),
)
for (const [container, image, minimum] of [
  ["api", release.api, 3],
  ["web", release.web, 2],
] as const) {
  const command = Bun.spawn(
    [
      "kubectl",
      "--context=docker-desktop",
      "-n",
      "regchula",
      "get",
      "pods",
      "-l",
      `app.kubernetes.io/name=regchula-${container}`,
      "-o",
      "json",
    ],
    { stdout: "pipe", stderr: "inherit" },
  )
  const output = await new Response(command.stdout).text()
  if ((await command.exited) !== 0) throw new Error(`Could not inspect ${container} replicas`)
  const pods: {
    items: Array<{
      metadata: { deletionTimestamp?: string }
      spec: { containers: Array<{ name: string; image: string }> }
      status: { containerStatuses?: Array<{ name: string; ready: boolean; imageID: string }> }
    }>
  } = JSON.parse(output)
  const active = pods.items.filter((pod) => !pod.metadata.deletionTimestamp)
  if (
    active.length < minimum ||
    active.some(
      (pod) =>
        pod.spec.containers.find((item) => item.name === container)?.image !== image ||
        !pod.status.containerStatuses?.some(
          (item) => item.name === container && item.ready && item.imageID,
        ),
    )
  )
    throw new Error(`${container} replicas have not all started the expected release image`)
  console.log(`[RegChula] Verified ${active.length} ready ${container} replicas on ${image}`)
}
