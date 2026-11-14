import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { mkdtemp, open, rmdir, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import {
  parseArguments,
  protectBackupFile,
  studentTables,
  validateBackup,
} from "./student-reset.ts"

test("reset and restore require an explicit offline confirmation", () => {
  assert.throws(() => parseArguments(["reset", "--confirm"]))
  assert.throws(() => parseArguments(["reset", "--offline"]))
  assert.deepEqual(parseArguments(["reset", "--offline", "--confirm"]), { operation: "reset" })
  assert.throws(() =>
    parseArguments(["restore", "--offline", "--confirm", "--backup", "../outside.json"]),
  )
  assert.deepEqual(
    parseArguments(["restore", "--offline", "--confirm", "--backup", "student-backup-1-a.json"]),
    {
      operation: "restore",
      name: "student-backup-1-a.json",
    },
  )
})

test("restore refuses incomplete or malformed backups", () => {
  const tables = Object.fromEntries(studentTables.map((name) => [name, []]))
  const backup = {
    version: 2,
    database: "regchula",
    tables,
    studentAuditEvents: [{ id: 1, action: "student.updated" }],
    sectionCounters: [{ id: 5, local_active: 2 }],
  }
  assert.equal(validateBackup(backup).database, "regchula")
  assert.throws(() => validateBackup({ ...backup, tables: { students: [] } }))
  assert.throws(() =>
    validateBackup({ ...backup, sectionCounters: [{ id: "bad", local_active: 1 }] }),
  )
  assert.throws(() => validateBackup({ ...backup, tables: { ...tables, students: [null] } }))
  assert.throws(() =>
    validateBackup({ ...backup, studentAuditEvents: [{ action: "staff.updated" }] }),
  )
})

test("Windows backup ACL is restricted before data is written and errors fail closed", async () => {
  const calls: Array<{ file: string; args: string[] }> = []
  const run = async (file: string, args: string[]) => {
    calls.push({ file, args })
    return { stdout: file === "whoami.exe" ? '"user","S-1-5-21-123-456-789-1001"' : "" }
  }
  await protectBackupFile("backup.json", "win32", run)
  assert.deepEqual(calls[1], {
    file: "icacls.exe",
    args: ["backup.json", "/inheritance:r", "/grant:r", "*S-1-5-21-123-456-789-1001:(F)"],
  })
  await assert.rejects(() =>
    protectBackupFile("backup.json", "win32", async () => ({ stdout: "" })),
  )
  await assert.rejects(() =>
    protectBackupFile("backup.json", "win32", async (file) => {
      if (file === "whoami.exe") return { stdout: "S-1-5-21-123-456-789-1001" }
      throw new Error("ACL denied")
    }),
  )
})

test("Windows applies a non-inherited backup ACL", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = await mkdtemp(resolve("tmp", "student-reset-acl-"))
  const path = resolve(directory, "empty.json")
  try {
    const file = await open(path, "wx", 0o600)
    await file.close()
    await protectBackupFile(path)
    const { stdout } = await promisify(execFile)("icacls.exe", [path])
    assert.match(stdout, /\(F\)/)
    assert.doesNotMatch(stdout, /\(I\)/)
  } finally {
    await unlink(path)
    await rmdir(directory)
  }
})
