import { randomBytes } from "node:crypto"

process.env.APP_ENV = "test"
process.env.AUTH_MODE = "local-mock"
process.env.API_HOST = "127.0.0.1"
process.env.COOKIE_SECRET = randomBytes(32).toString("base64url")
process.env.CHALLENGE_SECRET = randomBytes(32).toString("base64url")
process.env.CONFIRMATION_SECRET = randomBytes(32).toString("base64url")
