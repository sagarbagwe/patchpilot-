# Security

## Safe defaults

- Demo mode does not call a model or write to GitHub.
- Gemini mode reads only a bounded set of text files.
- Generated paths are validated before any Git operation.
- A deterministic secret scan runs before review.
- GitHub writes require both `GITHUB_TOKEN` and
  `PATCHPILOT_ENABLE_WRITES=true`.
- Pull requests are created as drafts.

Use a fine-grained GitHub token scoped to only the repositories you intend to
test. Never expose server environment variables to the browser.

## Reporting

Please open a private security advisory in the GitHub repository rather than a
public issue.
