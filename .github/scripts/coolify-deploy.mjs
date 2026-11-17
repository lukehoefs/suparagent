// Deploy one Coolify application and wait until it answers its health check.
//
// ci.yml's "Deploy production" job runs this after every CI job has passed on main. It also runs by hand,
// for example against staging:
//
//   COOLIFY_TOKEN=... COOLIFY_APP=<app uuid> SITE_URL=https://staging.lthops.tech \
//   EXPECTED_SHA=<commit> node .github/scripts/coolify-deploy.mjs
//
// Settings (environment variables):
//   COOLIFY_TOKEN   Coolify API token with read and deploy rights (Keys & Tokens, API tokens).
//   COOLIFY_API     Coolify API base, default https://lthops.tech/api/v1.
//   COOLIFY_APP     UUID of the Coolify application.
//   SITE_URL        Public address of the application; /api/v1/health must answer {"status":"ok"}.
//   EXPECTED_SHA    The commit that passed CI. Only that commit is deployed.
//   BRANCH, GITHUB_REPOSITORY, GITHUB_TOKEN
//                   Optional: when all are set, nothing is deployed if BRANCH has moved past EXPECTED_SHA
//                   (the newer commit's own CI run deploys it).
//
// Exit 0: the tested commit is live, or there was nothing to do because the branch moved on.
// Exit 1: anything else; the message says whether production may be affected.
//
// The repository is public, so this prints statuses and commits only, never Coolify's build or container
// logs. Those are in Coolify: the application, Deployments.

const API = (process.env.COOLIFY_API || "https://lthops.tech/api/v1").replace(/\/+$/, "");
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";
const POLL_MS = Number(process.env.POLL_MS || 10_000);
const DEPLOY_TIMEOUT_MS = 30 * 60_000;
const HEALTH_TIMEOUT_MS = 5 * 60_000;
const FULL_SHA = /^[0-9a-f]{40}$/;
const ENDED = /^(finished|failed|cancelled|cancelled-by-user|error|skipped)$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (sha) => String(sha || "").slice(0, 7);
// Text that came from Coolify goes into ::error:: lines; keep it on one line and free of "::".
const clean = (text) => String(text ?? "").replace(/[\r\n]+/g, " ").replace(/::/g, ": :").slice(0, 200);
const summaryLines = [];

// What is being deployed, for the messages and the cancel handler.
const state = { deployment: "", status: "", commit: "" };

function say(kind, message) {
  // ::notice:: and ::error:: show on the run's summary page; locally they would only be noise.
  console.log(IN_ACTIONS && kind !== "info" ? `::${kind}::${message}` : message);
  summaryLines.push(kind === "error" ? `**${message}**` : message);
}

async function writeSummary() {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Deploy\n\n${summaryLines.map((l) => `- ${l}`).join("\n")}\n`);
}

class Done extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}

async function finish(code, kind, message) {
  say(kind, message);
  throw new Done(code);
}

function required(name, hint) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.log(IN_ACTIONS ? `::error::${name} is not set. ${hint}` : `${name} is not set. ${hint}`);
    process.exit(1);
  }
  return value;
}

const TOKEN = required(
  "COOLIFY_TOKEN",
  "Create a Coolify API token with read and deploy rights (Keys & Tokens, API tokens) and save it as the repository secret COOLIFY_DEPLOY_TOKEN (Settings, Secrets and variables, Actions).",
);
const APP = required("COOLIFY_APP", "Set it to the Coolify application's UUID.");
const SITE = required("SITE_URL", "Set it to the application's public address.").replace(/\/+$/, "");
const EXPECTED = required("EXPECTED_SHA", "Set it to the commit that passed CI.").toLowerCase();

// Coolify API call. Network errors, 429 and 5xx are retried for about a minute, then thrown.
async function coolify(path, method = "GET") {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt >= 6) throw new Error(`Coolify did not answer ${method} ${path} (${error.message})`);
      await sleep(10_000);
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 6) {
      await sleep(10_000);
      continue;
    }
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (response.status === 401 || response.status === 403) {
      await finish(1, "error", `Coolify refused ${method} ${path} (${response.status}). The token needs read and deploy rights.`);
    }
    return { status: response.status, body };
  }
}

async function branchHead() {
  const { BRANCH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  if (!BRANCH || !GITHUB_REPOSITORY || !GITHUB_TOKEN) return null;
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/git/ref/heads/${encodeURIComponent(BRANCH)}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) await finish(1, "error", `Could not read the head of ${BRANCH} from GitHub (${response.status}).`);
  return String((await response.json())?.object?.sha || "").toLowerCase();
}

async function healthy() {
  try {
    const response = await fetch(`${SITE}/api/v1/health`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (response.status !== 200) return `answered ${response.status}`;
    const body = await response.json().catch(() => null);
    return body?.status === "ok" ? true : "answered 200 without status ok";
  } catch (error) {
    return `did not answer (${error.message})`;
  }
}

async function waitHealthy(timeoutMs) {
  const started = Date.now();
  let health = await healthy();
  while (health !== true && Date.now() - started < timeoutMs) {
    await sleep(POLL_MS);
    health = await healthy();
  }
  return health;
}

// The newest deployment of the application that is still waiting or running, or null.
async function activeDeployment() {
  const { status, body } = await coolify(`/deployments/applications/${APP}?skip=0&take=5`);
  if (status !== 200) return null;
  const list = Array.isArray(body) ? body : body?.deployments || [];
  return list.find((d) => /^(queued|in_progress)$/.test(String(d.status))) || null;
}

// The job is being cancelled (a person, or a timeout). A deployment that has not shown it is building the
// tested commit is cancelled too, so nothing untested goes live unwatched.
let stopping = false;
async function onSignal(signal) {
  if (stopping) return;
  stopping = true;
  const unconfirmed = state.status === "queued" || (state.status === "in_progress" && state.commit !== EXPECTED);
  if (state.deployment && unconfirmed) {
    try {
      await fetch(`${API}/deployments/${state.deployment}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      say("error", `Stopped (${signal}); asked Coolify to cancel deployment ${state.deployment}. Check Coolify, the application, Deployments.`);
    } catch {
      say("error", `Stopped (${signal}); could not cancel Coolify deployment ${state.deployment}. Check Coolify, the application, Deployments.`);
    }
  } else if (state.deployment) {
    say("error", `Stopped (${signal}) while Coolify deploys ${short(state.commit || EXPECTED)}; that deployment goes on. Check Coolify, the application, Deployments.`);
  } else {
    say("error", `Stopped (${signal}) before anything was deployed.`);
  }
  await writeSummary().catch(() => {});
  process.exit(1);
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

async function main() {
  if (!FULL_SHA.test(EXPECTED)) await finish(1, "error", `EXPECTED_SHA must be a full 40-character commit, not "${clean(EXPECTED)}".`);

  // 1. Coolify must stop the old container before it starts the new one. The server keeps its data in one
  //    SQLite file and runs its migrations before it checks that no other copy is running, so a rolling
  //    update would upgrade the database under the live server and then roll back to the old code.
  //    It must also build the branch, not a commit pinned in Coolify.
  const app = await coolify(`/applications/${APP}`);
  if (app.status !== 200) await finish(1, "error", `Coolify has no application ${APP} for this token (${app.status}).`);
  if (app.body?.settings?.is_consistent_container_name_enabled !== true) {
    await finish(1, "error",
      "Consistent Container Names is off for this application in Coolify (Advanced), so Coolify would start the new " +
      "container beside the old one on the same database. Turn it on, or deploy by hand with Stop first. Nothing was deployed.");
  }
  const pin = String(app.body?.git_commit_sha ?? "").trim();
  if (pin && pin.toUpperCase() !== "HEAD") {
    await finish(1, "error", `Coolify has this application pinned to commit "${clean(pin)}" (Git Commit SHA), so it would not build the branch. Set it back to HEAD. Nothing was deployed.`);
  }

  // 2. Deploy only the commit that was tested.
  const head = await branchHead();
  if (head && head !== EXPECTED) {
    await finish(0, "notice", `${process.env.BRANCH} has moved on to ${short(head)}; skipped ${short(EXPECTED)}. The run for ${short(head)} deploys it once its CI passes.`);
  }

  // 3. Queue the deployment. When one is already waiting for the branch, Coolify answers "already queued"
  //    with an id it never stored; follow the waiting one instead (step 4 checks its commit).
  let queued = await coolify(`/deploy?uuid=${encodeURIComponent(APP)}&force=false`, "POST");
  if (queued.status === 405) queued = await coolify(`/deploy?uuid=${encodeURIComponent(APP)}&force=false`);
  const answer = queued.body?.deployments?.[0] || {};
  if (queued.status >= 400) {
    await finish(1, "error", `Coolify did not queue a deployment (${queued.status}): ${clean(answer.message || queued.body?.message || "no message")}. Nothing was deployed.`);
  }
  state.deployment = answer.deployment_uuid || "";
  const known = state.deployment ? (await coolify(`/deployments/${state.deployment}`)).status === 200 : false;
  if (!known) {
    const waiting = await activeDeployment();
    if (!waiting) {
      await finish(1, "error", `Coolify answered "${clean(answer.message || "no deployment id")}" but shows no waiting or running deployment. Nothing was deployed; check Coolify, the application, Deployments.`);
    }
    state.deployment = waiting.deployment_uuid;
    say("info", `Coolify already had deployment ${state.deployment} waiting; following it.`);
  } else {
    say("info", `Coolify deployment ${state.deployment} queued for ${short(EXPECTED)}.`);
  }

  // 4. Follow it. Coolify builds the branch's latest commit; if that is not the tested one, cancel.
  const started = Date.now();
  state.status = "queued";
  let lostContact = false;
  let lastPrinted = "";
  while (!ENDED.test(state.status)) {
    if (Date.now() - started > DEPLOY_TIMEOUT_MS) {
      await finish(1, "error", lostContact
        ? `Lost contact with Coolify while deployment ${state.deployment} was ${state.status}; it may still go live. Check Coolify, the application, Deployments.`
        : `Coolify deployment ${state.deployment} is still ${state.status} after 30 minutes. Check Coolify, the application, Deployments.`);
    }
    await sleep(POLL_MS);
    let reply;
    try {
      reply = await coolify(`/deployments/${state.deployment}`);
    } catch (error) {
      lostContact = true;
      console.log(`Coolify is not answering (${error.message}); still waiting.`);
      continue;
    }
    if (reply.status === 404) await finish(1, "error", `Coolify no longer knows deployment ${state.deployment}. Check Coolify, the application, Deployments.`);
    if (reply.status !== 200 || !reply.body) continue;
    lostContact = false;
    state.status = String(reply.body.status || state.status);
    const reported = String(reply.body.commit || "").toLowerCase();
    if (FULL_SHA.test(reported)) state.commit = reported;

    if (state.commit && state.commit !== EXPECTED && /^(queued|in_progress)$/.test(state.status)) {
      const cancel = await coolify(`/deployments/${state.deployment}/cancel`, "POST");
      if (cancel.status >= 400) {
        await finish(1, "error", `Coolify is building ${short(state.commit)}, not the tested ${short(EXPECTED)}, and refused to cancel (${cancel.status}). Check Coolify, the application, Deployments.`);
      }
      // A cancel that lands while Coolify swaps containers can leave the site down; check.
      const health = await waitHealthy(2 * 60_000);
      if (health !== true) {
        await finish(1, "error", `Cancelled Coolify deployment of ${short(state.commit)} (not the tested ${short(EXPECTED)}), and now ${SITE}/api/v1/health ${health}. The site may be down; check Coolify.`);
      }
      const now = await branchHead();
      if (now && now === state.commit) {
        await finish(0, "notice", `Coolify picked up ${short(state.commit)}, which ${process.env.BRANCH} has moved on to since ${short(EXPECTED)} was tested; cancelled it. The run for ${short(state.commit)} deploys it once its CI passes.`);
      }
      await finish(1, "error", `Coolify started building ${short(state.commit)}, which is not the tested ${short(EXPECTED)}${now ? ` nor the head of ${process.env.BRANCH} (${short(now)})` : ""}; cancelled it. Check the application's branch in Coolify.`);
    }

    const line = `${state.status}${state.commit ? ` (${short(state.commit)})` : ""}`;
    if (line !== lastPrinted) {
      console.log(`${new Date().toISOString().slice(11, 19)} deployment ${line}`);
      lastPrinted = line;
    }
  }
  if (state.status !== "finished") {
    await finish(1, "error", `Coolify deployment ${state.deployment} ended "${clean(state.status)}". The site may be down; see Coolify, the application, Deployments, and roll back there if needed.`);
  }
  if (state.commit !== EXPECTED) {
    await finish(1, "error", state.commit
      ? `Coolify deployed ${short(state.commit)}, not the tested ${short(EXPECTED)}. Check that commit's CI run.`
      : `Coolify finished deployment ${state.deployment} without saying which commit it built. Check Coolify, the application, Deployments.`);
  }

  // 5. The server answers once it has started (migrations run before it starts).
  const health = await waitHealthy(HEALTH_TIMEOUT_MS);
  if (health !== true) {
    await finish(1, "error", `Deployed ${short(EXPECTED)}, but ${SITE}/api/v1/health ${health} after 5 minutes. The site is probably down; check the container logs in Coolify and roll back there if needed.`);
  }
  await finish(0, "notice", `${short(EXPECTED)} is live at ${SITE} (Coolify deployment ${state.deployment}).`);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof Done)) {
    say("error", `Deploy stopped on an unexpected error: ${clean(error?.message || error)}.${state.deployment ? ` Coolify deployment ${state.deployment} may still be running; check Coolify, the application, Deployments.` : " Nothing was deployed."}`);
  }
  await writeSummary().catch(() => {});
  process.exit(error instanceof Done ? error.code : 1);
}
