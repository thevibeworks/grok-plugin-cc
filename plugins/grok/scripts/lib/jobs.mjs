import fs from "node:fs";
import process from "node:process";

import {
  generateJobId,
  listJobs,
  nowIso,
  readJobFile,
  resolveJobFile,
  resolveJobLogFile,
  upsertJob,
  writeJobFile
} from "./state.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

export const SESSION_ID_ENV = "GROK_COMPANION_SESSION_ID";

export function getCurrentClaudeSessionId() {
  return process.env[SESSION_ID_ENV] ?? null;
}

export function createJobRecord({ prefix, kind, title, workspaceRoot, jobClass, summary, write = false }) {
  return {
    id: generateJobId(prefix),
    kind,
    title,
    jobClass,
    summary,
    write,
    workspaceRoot,
    sessionId: getCurrentClaudeSessionId(),
    status: "created",
    phase: "created",
    pid: null,
    grokSessionId: null,
    logFile: null
  };
}

export function appendLogLine(logFile, message) {
  if (!logFile) {
    return;
  }
  try {
    fs.appendFileSync(logFile, `[${nowIso()}] ${message}\n`, "utf8");
  } catch {
    // Logging must never break a run.
  }
}

export function createJobLogFile(workspaceRoot, jobId, title) {
  const logFile = resolveJobLogFile(workspaceRoot, jobId);
  appendLogLine(logFile, `${title} (${jobId}) created.`);
  return logFile;
}

export function createProgressReporter({ logFile, workspaceRoot, jobId }) {
  return (event) => {
    if (!event) {
      return;
    }
    const detail = event.detail ? `: ${event.detail}` : "";
    appendLogLine(logFile, `${event.phase}${detail}`);
    if (event.phase && workspaceRoot && jobId) {
      try {
        upsertJob(workspaceRoot, { id: jobId, phase: event.phase });
      } catch {
        // Progress bookkeeping is best-effort.
      }
    }
  };
}

export async function runTrackedJob(job, runner, { logFile }) {
  upsertJob(job.workspaceRoot, {
    ...job,
    status: "running",
    phase: "running",
    pid: process.pid,
    logFile,
    startedAt: nowIso()
  });

  try {
    const execution = await runner();
    const failed = execution.exitStatus !== 0;
    const completedAt = nowIso();
    const record = {
      id: job.id,
      status: failed ? "failed" : "completed",
      phase: failed ? "failed" : "completed",
      pid: null,
      grokSessionId: execution.grokSessionId ?? null,
      summary: execution.summary ?? job.summary,
      errorMessage: failed ? execution.summary ?? "grok run failed." : null,
      completedAt
    };
    writeJobFile(job.workspaceRoot, job.id, {
      ...job,
      ...record,
      logFile,
      payload: execution.payload,
      rendered: execution.rendered
    });
    upsertJob(job.workspaceRoot, record);
    appendLogLine(logFile, failed ? `Failed: ${record.errorMessage}` : "Completed.");
    return execution;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completedAt = nowIso();
    writeJobFile(job.workspaceRoot, job.id, {
      ...job,
      status: "failed",
      phase: "failed",
      pid: null,
      errorMessage: message,
      completedAt,
      logFile
    });
    upsertJob(job.workspaceRoot, {
      id: job.id,
      status: "failed",
      phase: "failed",
      pid: null,
      errorMessage: message,
      completedAt
    });
    appendLogLine(logFile, `Failed: ${message}`);
    throw error;
  }
}

export function isActiveJobStatus(status) {
  return status === "queued" || status === "running";
}

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((left, right) =>
    String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? ""))
  );
}

export function readStoredJob(workspaceRoot, jobId) {
  const jobFile = resolveJobFile(workspaceRoot, jobId);
  if (!fs.existsSync(jobFile)) {
    return null;
  }
  try {
    return readJobFile(jobFile);
  } catch {
    return null;
  }
}

function findJob(jobs, reference) {
  if (!reference) {
    return null;
  }
  return jobs.find((job) => job.id === reference) ?? null;
}

export function buildStatusSnapshot(cwd, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));
  const visible = options.all ? jobs : jobs.slice(0, 10);
  return {
    workspaceRoot,
    totalJobs: jobs.length,
    activeJobs: jobs.filter((job) => isActiveJobStatus(job.status)).length,
    jobs: visible
  };
}

export function buildSingleJobSnapshot(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = findJob(listJobs(workspaceRoot), reference);
  if (!job) {
    throw new Error(`No job found with id ${reference}.`);
  }
  return { workspaceRoot, job };
}

export function resolveResultJob(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));

  if (reference) {
    const job = findJob(jobs, reference);
    if (!job) {
      throw new Error(`No job found with id ${reference}.`);
    }
    return { workspaceRoot, job };
  }

  const finished = jobs.find((job) => !isActiveJobStatus(job.status));
  if (!finished) {
    throw new Error("No finished jobs found. Check /grok:status for active jobs.");
  }
  return { workspaceRoot, job: finished };
}

export function resolveCancelableJob(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));

  if (reference) {
    const job = findJob(jobs, reference);
    if (!job) {
      throw new Error(`No job found with id ${reference}.`);
    }
    if (!isActiveJobStatus(job.status)) {
      throw new Error(`Job ${reference} is not running (status: ${job.status}).`);
    }
    return { workspaceRoot, job };
  }

  const active = jobs.filter((job) => isActiveJobStatus(job.status));
  if (active.length === 0) {
    throw new Error("No active jobs to cancel.");
  }
  if (active.length > 1) {
    throw new Error(`Multiple active jobs: ${active.map((job) => job.id).join(", ")}. Pass a job id.`);
  }
  return { workspaceRoot, job: active[0] };
}

export function findLatestResumableTaskJob(jobs) {
  return (
    jobs.find(
      (job) => job.jobClass === "task" && job.grokSessionId && !isActiveJobStatus(job.status)
    ) ?? null
  );
}

export function filterJobsForCurrentClaudeSession(jobs) {
  const sessionId = getCurrentClaudeSessionId();
  if (!sessionId) {
    return jobs;
  }
  return jobs.filter((job) => job.sessionId === sessionId);
}
