import { eq } from "drizzle-orm"
import { closeDatabase, db } from "../db/client"
import { staffUsers } from "../db/schema/staff"

const useStdin = process.argv.slice(2).includes("--stdin")
const password = useStdin
  ? (await Bun.stdin.text()).replace(/\r?\n$/, "")
  : process.env.STAFF_ADMIN_PASSWORD
if (!password || password.length < 8 || password.length > 128) {
  throw new Error(
    "Supply an 8–128 character password through --stdin or STAFF_ADMIN_PASSWORD for the one-time administrator setup",
  )
}

try {
  const [existing] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.username, "administrator"))
    .limit(1)
  if (existing)
    throw new Error("The administrator account already exists; setup does not overwrite it")
  await db
    .insert(staffUsers)
    .values({
      id: crypto.randomUUID(),
      username: "administrator",
      displayName: "Administrator",
      role: "admin",
      passwordHash: await Bun.password.hash(password),
    })
  console.log("Administrator account created")
} finally {
  await closeDatabase()
}
