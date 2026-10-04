/**
 * A public repository, off GitHub, onto disk.
 *
 * No token is sent and no scope is requested: the archive endpoint serves
 * public repositories to anyone, so there is nothing to store and nothing to
 * leak. GitHub's anonymous rate limit applies to the metadata calls, and what
 * it says when it refuses is passed through rather than replaced.
 *
 * Nothing here knows about the parser, the database or the interface: it takes
 * a reference and a directory and puts files in it.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "tar";
import type { RepositoryRef } from "./url.ts";

const API = "https://api.github.com";
const ARCHIVE = "https://codeload.github.com";
/** Serves file bytes at a commit, which is not the API and not rate limited. */
const RAW = "https://raw.githubusercontent.com";

/** GitHub rejects a request without one. */
const USER_AGENT = "cartograph";

/** Regular files, whichever tar spelling the archive used. */
const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);

export interface Workspace {
  /** The temporary directory, removed once the run is done with it. */
  directory: string;
  /** What the parser is pointed at. */
  root: string;
}

export interface FetchedRepository {
  /** The commit the archive was cut from, so a later run can tell it moved. */
  commitSha: string;
  defaultBranch: string;
  /** Regular files the archive held, which is not the same as files parsed. */
  files: number;
}

export async function createWorkspace(): Promise<Workspace> {
  const directory = await mkdtemp(join(tmpdir(), "cartograph-"));
  const root = join(directory, "repository");
  await mkdir(root, { recursive: true });
  return { directory, root };
}

export async function removeWorkspace(workspace: Workspace): Promise<void> {
  await rm(workspace.directory, { recursive: true, force: true });
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function messageOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const message = fieldOf(parsed, "message");
    return typeof message === "string" && message !== "" ? message : null;
  } catch {
    return null;
  }
}

async function failureFor(response: Response, subject: string): Promise<Error> {
  if (response.status === 404) {
    return new Error(`GitHub has no public repository at ${subject}.`);
  }

  const detail = messageOf(await response.text());
  const tail = detail === null ? "." : `: ${detail}`;

  if (response.status === 403 || response.status === 429) {
    return new Error(`GitHub refused the request (${response.status})${tail}`);
  }
  return new Error(`GitHub returned ${response.status}${tail}`);
}

async function readJson(path: string, subject: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
      "x-github-api-version": "2022-11-28",
    },
    // A repository moves under us; a cached answer here would pin the run to
    // whatever the last one saw.
    cache: "no-store",
  });

  if (!response.ok) throw await failureFor(response, subject);
  return response.json();
}

/** The commit at the head of the repository's default branch, right now. */
async function headOf(ref: RepositoryRef): Promise<{ commitSha: string; defaultBranch: string }> {
  const subject = `${ref.owner}/${ref.repo}`;
  const repository = await readJson(`/repos/${ref.owner}/${ref.repo}`, subject);
  const branch = fieldOf(repository, "default_branch");
  if (typeof branch !== "string" || branch === "") {
    throw new Error(`GitHub did not say which branch of ${subject} is the default one.`);
  }

  const commits = await readJson(
    `/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
    subject,
  );
  const head: unknown = Array.isArray(commits) ? commits[0] : undefined;
  const sha = fieldOf(head, "sha");
  if (typeof sha !== "string" || sha === "") {
    throw new Error(`GitHub did not name a commit on ${subject}.`);
  }

  return { commitSha: sha, defaultBranch: branch };
}

/**
 * Fetches the commit's archive and unpacks it, with the archive's own top-level
 * directory stripped so the paths inside are repository-relative.
 *
 * Only files and directories are extracted, with no hard links and no symbolic
 * links: whatever a symlink pointed at is not part of this repository, and the
 * parser would report it as skipped anyway.
 */
export async function fetchRepository(
  ref: RepositoryRef,
  workspace: Workspace,
): Promise<FetchedRepository> {
  const subject = `${ref.owner}/${ref.repo}`;
  const head = await headOf(ref);

  const archiveUrl = `${ARCHIVE}/${ref.owner}/${ref.repo}/tar.gz/${head.commitSha}`;
  const response = await fetch(archiveUrl, {
    headers: { "user-agent": USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) throw await failureFor(response, subject);

  const archivePath = join(workspace.directory, "repository.tar.gz");
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  let files = 0;
  await extract({
    file: archivePath,
    cwd: workspace.root,
    strip: 1,
    noMtime: true,
    filter: (_path, entry) => {
      const type = "type" in entry ? entry.type : "File";
      if (FILE_TYPES.has(type)) files += 1;
      return FILE_TYPES.has(type) || type === "Directory";
    },
  });

  return { commitSha: head.commitSha, defaultBranch: head.defaultBranch, files };
}

/**
 * The commit at the head of the repository right now, for judging whether a run
 * still describes it. The default branch is stored with the project, so this is
 * one call when it is known and two when it is not.
 *
 * This goes through the API, which allows an anonymous caller sixty requests an
 * hour. One per explanation is within that; a page explaining twenty files in a
 * row is not, and GitHub saying so is reported rather than swallowed.
 */
export async function headCommit(ref: RepositoryRef, branch: string | null): Promise<string> {
  if (branch === null || branch === "") {
    return (await headOf(ref)).commitSha;
  }

  const subject = `${ref.owner}/${ref.repo}`;
  const commits = await readJson(
    `/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
    subject,
  );
  const head: unknown = Array.isArray(commits) ? commits[0] : undefined;
  const sha = fieldOf(head, "sha");
  if (typeof sha !== "string" || sha === "") {
    throw new Error(`GitHub did not name a commit on ${subject}.`);
  }
  return sha;
}

/**
 * One file's bytes as they are at a commit, or null when the repository has no
 * such file there. Read through the raw host rather than the API, so checking a
 * file does not spend the request budget the API calls need.
 */
export async function fileBytesAt(
  ref: RepositoryRef,
  sha: string,
  path: string,
): Promise<Buffer | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${RAW}/${ref.owner}/${ref.repo}/${sha}/${encoded}`;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${path}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}
