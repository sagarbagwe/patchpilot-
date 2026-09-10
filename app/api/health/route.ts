export function GET(): Response {
  return Response.json({
    status: "ok",
    service: "patchpilot",
    provider: "google-gemini",
    model: "gemini-3.6-flash",
    liveMode: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
    githubWrites: process.env.PATCHPILOT_ENABLE_WRITES === "true",
  });
}
