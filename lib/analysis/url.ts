/**
 * A pasted repository URL, turned into the two names the run needs.
 *
 * Pure, and deliberately strict: a URL that names a page inside a repository is
 * refused rather than trimmed down to one, because guessing which repository
 * someone meant is the same failure as guessing at an edge.
 */

export interface RepositoryRef {
  owner: string;
  repo: string;
  /** What the project row stores, so the same repository pasted twice is one project. */
  url: string;
}

export type ParsedRepositoryUrl =
  | { ok: true; ref: RepositoryRef }
  | { ok: false; message: string };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** GitHub's own rule: a name starts with a letter or digit. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const GITHUB_PREFIX = "https://github.com/";

export function parseRepositoryUrl(input: string): ParsedRepositoryUrl {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, message: "Paste a repository URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, message: `"${trimmed}" is not a URL.` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "Only a GitHub URL over http or https can be read." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(host)) {
    return { ok: false, message: `${host} is not GitHub. Public GitHub repositories only.` };
  }

  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length < 2) {
    return {
      ok: false,
      message: "That URL names no repository. It should look like https://github.com/owner/repo.",
    };
  }
  if (segments.length > 2) {
    return {
      ok: false,
      message: "That URL points inside a repository. Paste the repository's own URL.",
    };
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  if (!NAME.test(owner) || !NAME.test(repo)) {
    return { ok: false, message: `"${owner}/${repo}" is not a repository name.` };
  }

  // Canonical, so the same repository is one row in `projects` however it was
  // pasted, and a second paste cannot become a second analysis.
  return { ok: true, ref: { owner, repo, url: `${GITHUB_PREFIX}${owner}/${repo}` } };
}

/** The owner and repository a stored, canonical URL names. */
export function repositoryName(url: string): string {
  return url.startsWith(GITHUB_PREFIX) ? url.slice(GITHUB_PREFIX.length) : url;
}
