# Releasing lukethomas

How a change gets from a branch to the live server at https://agent.lthops.tech, with a staging copy and automatic tests on the way. Both servers run on the same Coolify host, in the `suparagent` project.

| | Production | Staging |
|---|---|---|
| Address | https://agent.lthops.tech | https://staging.lthops.tech |
| Coolify app | `suparagent` (environment `production`) | `suparagent-staging` (environment `staging`) |
| Branch it builds | `main` | `ui/redesign` |
| Deploys | by itself, from GitHub, once CI passes on `main` | on every push to `ui/redesign`, by itself |
| Data | its own `/data` volume | its own `/data` volume, never production's |

Staging has its own database, encryption key and accounts. Nothing you do there touches the real agents. A fresh server can only get its owner from inside the container, so nobody can claim it over the web: in Coolify open `suparagent-staging`, **Terminal**, run `python -m app.auth.cli set-passphrase` and type the passphrase twice.

## The flow

1. **Work on a branch.** Make the change on `ui/redesign`, or on a branch that merges into it.
2. **Tests run on GitHub.** Every push to `main` or `ui/**`, every pull request, and a manual run (Actions, **CI**, **Run workflow**) start the CI workflow at https://github.com/lukehoefs/suparagent/actions. It runs only the parts that changed: backend tests on SQLite and PostgreSQL, the sandbox and smoke tests, the frontend lint, tests and build, mobile and desktop. A change to `.github/workflows/ci.yml` runs all of them, and so does every run on `main`, because `main` is what deploys. On Windows about 100 backend tests fail for reasons unrelated to the code (POSIX signals, Unix sockets, symlinks), so CI on Linux is the reference.
3. **Staging updates itself.** A push to `ui/redesign` sends a signed webhook from GitHub to Coolify, which rebuilds `suparagent-staging` (about 5 to 8 minutes). Try the change at https://staging.lthops.tech. Staging stops its old container before it starts the new one, so it is down for a few seconds on each deploy. That comes from **Consistent Container Names** (Coolify, `suparagent-staging`, **Advanced**), which must stay on: without it Coolify starts the new container next to the old one, the server refuses to share its database with another running copy, and every deploy fails and rolls back to the old build.
4. **Release to production** when CI is green and staging looks right: fast-forward `main` to the tested commit with `git push origin ui/redesign:main` (this refuses to overwrite anything that is not already in `ui/redesign`). That is the whole release. CI runs on `main`, and when every job passes, the **Deploy production** job in the same run tells Coolify to deploy, follows the deployment and waits until `https://agent.lthops.tech/api/v1/health` answers `{"status":"ok"}`. Coolify removes the old container before it starts the new one, so the site is down for a few seconds. A red **Deploy production** job means the release did not go live, or went live and is not answering; its summary says which. GitHub emails whoever pushed when a run fails.

   The job deploys only the commit that passed CI. If `main` has moved on by then, it skips, and the newer commit's own run deploys it. If Coolify starts building a newer commit than the tested one, the job cancels that deployment. Runs on `main` never cancel each other; a second deploy waits for the first to finish. **Actions, CI, Run workflow** on `main` runs the tests and deploys again by hand. Clicking **Deploy** in Coolify still works too, without waiting for CI.

   The job refuses to deploy unless **Consistent Container Names** is on for `suparagent` (Coolify, **Advanced**), and it must stay on. Production uses one SQLite file; without that setting Coolify's rolling update would start the new container while the old one still has the database open. The new server would then refuse to start and Coolify would keep the old one, but the start-up migration would already have run, leaving the old code on the new schema. If the setting is ever off, deploy by hand: click **Stop** and wait for *Exited* before **Deploy**.

   Coolify's own push-to-deploy stays off for production: it would start before CI has finished.
5. **Migrations back up the database.** On start, the server runs `python -m app.server migrate`. When the schema needs updating it first copies the database to `/data/backups/suparagent-<old revision>-<time>.db`, then upgrades it. The log says *Copied the database to …* and *Database ready at revision …*.

## Undoing a release

- **Code only:** revert the change on `ui/redesign` (`git revert`) and release that; it deploys like any other release. For an immediate fix, Coolify keeps the app's earlier images: `suparagent`, **Rollback**, pick the previous one. The next release replaces it.
- **A migration that went wrong:** stop the app, restore the backup from `/data/backups/` over `/data/suparagent.db` (Coolify terminal, or the server), then roll back (Coolify, **Rollback**) to the image of the commit that matches that backup's revision. The backup's file name says which revision it was taken at.

## Where the settings live

- Webhook: GitHub repository **Settings, Webhooks**, the hook to `https://lthops.tech/webhooks/source/github/events/manual` (push events). Coolify checks its signature against the secret saved on `suparagent-staging` (**Webhooks** tab). Production has no secret and auto-deploy off, so the hook never deploys it.
- Production deploy: the **Deploy production** job at the end of `.github/workflows/ci.yml`, which runs `.github/scripts/coolify-deploy.mjs`. It uses the repository secret `COOLIFY_DEPLOY_TOKEN` (GitHub **Settings, Secrets and variables, Actions**), a Coolify API token with only the **read** and **deploy** rights (Coolify **Keys & Tokens, API tokens**). The job never runs for pull requests, so forks never see it. The repository is public, so the job prints statuses and commits only; the build and container logs stay in Coolify (`suparagent`, **Deployments**).
- Environment variables: each Coolify app has its own. Staging copies production's names; `SUPARAGENT_PUBLIC_URL` and `FRONTEND_ORIGINS` point at staging, and `TOKEN_ENCRYPTION_KEYS` is its own key.
