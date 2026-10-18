const { randomBytes } = require("node:crypto")

exports.createStudent = (context, _events, next) => {
  context.vars.studentId = `bench-global-${randomBytes(8).toString("hex")}`
  next()
}

exports.verifyIdentity = (request, response, context, events, next) => {
  if (new URL(request.url).pathname !== "/api/v1/me") return next()
  try {
    const body = JSON.parse(response.body)
    if (response.statusCode !== 200 || body.data?.studentId !== context.vars.studentId) {
      events.emit("counter", "validation.identity_mismatch", 1)
      return next(new Error("CONCURRENT_IDENTITY_MISMATCH"))
    }
    events.emit("counter", "validation.identity_matched", 1)
    next()
  } catch {
    events.emit("counter", "validation.invalid_profile_response", 1)
    next(new Error("CONCURRENT_PROFILE_RESPONSE_INVALID"))
  }
}
