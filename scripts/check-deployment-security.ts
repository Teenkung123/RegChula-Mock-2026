import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const read = (path: string) => readFile(resolve(root, path), "utf8")
const requireText = (source: string, expected: string, label: string) => {
  if (!source.includes(expected)) throw new Error(`${label} is missing: ${expected}`)
}
const rejectText = (source: string, rejected: RegExp, label: string) => {
  if (rejected.test(source)) throw new Error(`${label} contains a forbidden deployment pattern`)
}

const [compose, kustomization, api, mysql, redis, policies, ignore, ...launchers] =
  await Promise.all([
    read("compose.yml"),
    read("deploy/k8s/kustomization.yaml"),
    read("deploy/k8s/base/api.yaml"),
    read("deploy/k8s/base/mysql.yaml"),
    read("deploy/k8s/base/redis.yaml"),
    read("deploy/k8s/base/network-policy.yaml"),
    read(".gitignore"),
    read("start-dev.bat"),
    read("start-k8s.bat"),
    read("stop.bat"),
    read("reset-data.bat"),
    read("scripts/dev.ts"),
  ])

requireText(compose, '"127.0.0.1:3307:3306"', "Compose MySQL loopback binding")
requireText(compose, '"127.0.0.1:6380:6379"', "Compose Redis loopback binding")
requireText(redis, "--maxmemory-policy noeviction", "Redis fail-closed memory policy")
requireText(api, "type: Recreate", "API security-boundary rollout")
requireText(policies, 'policyTypes: ["Ingress", "Egress"]', "default-deny policy")
requireText(kustomization, "order: fifo", "policy-first Kustomize ordering")
if (kustomization.indexOf("base/network-policy.yaml") > kustomization.indexOf("base/api.yaml")) {
  throw new Error("NetworkPolicy must be listed before workloads")
}
for (const [path, source] of [
  ["api.yaml", api],
  ["mysql.yaml", mysql],
  ["redis.yaml", redis],
] as const) {
  rejectText(source, /\b(?:NodePort|LoadBalancer|hostPort|hostNetwork)\b/, path)
  rejectText(
    source,
    /(?:MYSQL_ROOT_PASSWORD|COOKIE_SECRET|CHALLENGE_SECRET|CONFIRMATION_SECRET):\s*[^$\s]/,
    path,
  )
}
for (const source of launchers) requireText(source, "compose.yml", "Pinned Compose launcher")
const k8sStartup = await read("start-k8s.bat")
requireText(
  k8sStartup,
  "scripts/prepare-k8s-release.ts",
  "Content-specific local image preparation",
)
requireText(k8sStartup, '"!release_dir!\\jobs.yaml"', "Bootstrap release image")
requireText(k8sStartup, '"!release_dir!\\api.yaml"', "API release image")
requireText(k8sStartup, '"!release_dir!\\web.yaml"', "Web release image")
requireText(k8sStartup, "scripts/verify-k8s-release.ts", "Ready replica release verification")
for (const path of [
  ".env.local",
  ".env.k8s.local",
  ".env.k8s.mysql.local",
  ".env.k8s.redis.local",
]) {
  requireText(ignore, path, "Secret-file ignore rule")
}

console.log("[deployment] Loopback, secret, rollout, memory, and policy boundaries passed")
