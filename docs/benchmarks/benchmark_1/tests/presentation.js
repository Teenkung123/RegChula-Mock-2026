import http from "k6/http"
import { check, sleep } from "k6"

const baseUrl = __ENV.BASE_URL || "http://localhost:3000"
const origin = "http://localhost:5173"

http.setResponseCallback(http.expectedStatuses(200, 404, 409))

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "60s", target: 500 },
    { duration: "120s", target: 500 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000"],
    http_req_failed: ["rate<0.01"],
  },
}

const jsonHeaders = { "content-type": "application/json", origin }

function login() {
  const challengeResponse = http.get(`${baseUrl}/api/v1/auth/challenge`)
  const challenge = challengeResponse.json("data")
  check(challengeResponse, { "challenge created": (response) => response.status === 200 })
  if (!challenge) return false
  const studentId = `load-${String(__VU).padStart(5, "0")}`
  const response = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      studentId,
      password: "load-test",
      challengeCode: challenge.code,
      challengeToken: challenge.token,
    }),
    { headers: jsonHeaders },
  )
  return check(response, { "mock login accepted": (result) => result.status === 200 })
}

export default function () {
  if (!login()) return
  const bucket = Math.random()
  if (bucket < 0.6) {
    const response = http.get(`${baseUrl}/api/v1/courses?page=1&pageSize=20&q=2`)
    check(response, { "catalog search returned": (result) => result.status === 200 })
  } else if (bucket < 0.8) {
    const response = http.get(`${baseUrl}/api/v1/courses/2000501`)
    check(response, {
      "course detail handled": (result) => result.status === 200 || result.status === 404,
    })
  } else if (bucket < 0.9) {
    const response = http.get(`${baseUrl}/api/v1/me`)
    check(response, { "session isolated": (result) => result.status === 200 })
  } else {
    const detail = http.get(`${baseUrl}/api/v1/courses/9999999`)
    const sectionId = detail.json("data.sections.0.id")
    if (detail.status === 200 && sectionId) {
      const preview = http.post(
        `${baseUrl}/api/v1/registrations/preview`,
        JSON.stringify({ sectionId }),
        { headers: jsonHeaders },
      )
      const token = preview.json("data.confirmationToken")
      check(preview, { "registration preview handled": (result) => result.status === 200 })
      if (token) {
        const mutationHeaders = {
          ...jsonHeaders,
          "idempotency-key": `load-${__VU}-${__ITER}-${Date.now()}`,
        }
        const commit = http.post(
          `${baseUrl}/api/v1/registrations`,
          JSON.stringify({ confirmationToken: token }),
          { headers: mutationHeaders },
        )
        check(commit, {
          "registration commit handled": (result) => result.status === 200 || result.status === 409,
        })
        const registrationId = commit.json("data.registrationId")
        if (commit.status === 200 && registrationId && Math.random() < 0.5) {
          const dropPreview = http.post(
            `${baseUrl}/api/v1/registrations/${registrationId}/drop-preview`,
            null,
            { headers: jsonHeaders },
          )
          const dropToken = dropPreview.json("data.confirmationToken")
          if (dropToken) {
            const drop = http.post(
              `${baseUrl}/api/v1/registrations/${registrationId}/drop`,
              JSON.stringify({ confirmationToken: dropToken }),
              {
                headers: {
                  ...jsonHeaders,
                  "idempotency-key": `drop-${__VU}-${__ITER}-${Date.now()}`,
                },
              },
            )
            check(drop, {
              "course drop handled": (result) => result.status === 200 || result.status === 409,
            })
          }
        }
      }
    }
  }
  sleep(0.5)
}
