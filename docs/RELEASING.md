# Releasing lukethomas

How a change gets from a branch to the live server at https://agent.lthops.tech, with a staging copy and automatic tests on the way. Both servers run on the same Coolify host, in the `suparagent` project.

| | Production | Staging |
|---|---|---|
| Address | https://agent.lthops.tech | https://staging.lthops.tech |
| Coolify app | `suparagent` (environment `production`) | `suparagent-staging` (environment `staging`) |
| Branch it builds | `main` | `ui/redesign` |
| Deploys | on every push to `main`, by itself; GitHub only accepts commits that passed CI | on every push to `ui/redesign`, by itself |
| Data | its own `/data` volume | its own `/data` volume, never production's |

Staging has its own database, encryption key and accounts. Nothing you do there touches the real agents. A fresh server can only get its owner from inside the container, so nobody can claim it over the web: in Coolify open `suparagent-staging`, **Terminal**, run `python -m app.auth.cli set-passphrase` and type the passphrase twice.

## The flow

1. **Work on a branch.** Make the change on `ui/redesign`, or on a branch that merges into it.
2. **Tests run on GitHub.** Every push to `main` or `ui/**`, every pull request, and a manual run (Actions, **CI**, **Run workflow**) start the CI workflow at https://github.com/lukehoefs/suparagent/actions. It runs only the parts that changed: backend tests on SQLite and PostgreSQL, the sandbox and smoke tests, the frontend lint, tests and build, mobile and desktop. On `ui/redesign` it compares against `main`, so a green run covers everything that has not been released yet. A change to `.github/workflows/ci.yml` runs all of them. On Windows about 100 backend tests fail for reasons unrelated to the code (POSIX signals, Unix sockets, symlinks), so CI on Linux is the reference.
3. **Staging updates itself.** A push to `ui/redesign` sends a signed webhook from GitHub to Coolify, which rebuilds `suparagent-staging` (about 5 to 8 minutes). Try the change at https://staging.lthops.tech. Staging stops its old container before it starts the new one, so it is down for a few seconds on each deploy. That comes from **Consistent Container Names** (Coolify, `suparagent-staging`, **Advanced**), which must stay on: without it Coolify starts the new container next to the old one, the server refuses to share its database with another running copy, and every deploy fails and rolls back to the old build.
4. **Release to production** when CI is green and staging looks right: fast-forward `main` to the tested commit with `git push origin ui/redesign:main` (this refuses to overwrite anything that is not already in `ui/redesign`), or the same from GitHub Desktop. That is the whole release. The push sends the same signed webhook to Coolify, which deploys `suparagent` (about 5 to 8 minutes). Coolify removes the old container before it starts the new one, so the site is down for a few seconds. Check `https://agent.lthops.tech/api/v1/health` answers `{"status":"ok"}`, or watch Coolify, `suparagent`, **Deployments**.

   **Only tested commits can reach `main`.** `main` is a protected branch that requires the **ci-gate** check from GitHub Actions on the exact commit, for everyone including the repository's admins; force-pushes and deleting it are blocked. A push of a commit whose CI has not passed is refused with *Required status check "ci-gate" is expected*: wait for the run on `ui/redesign` to go green (or fix it) and push again. Because nothing untested can land on `main`, Coolify's push-to-deploy is safe to leave on for production.

   **Consistent Container Names** must stay on for `suparagent` too (Coolify, **Advanced**). Production uses one SQLite file; without that setting Coolify's rolling update would start the new container while the old one still has the database open. The start-up migration then refuses (*A Suparagent server … is still using the database …, so it was not changed*), the new container exits and Coolify keeps the old one: nothing breaks, but nothing deploys either. If the setting is ever off, deploy by hand: click **Stop** and wait for *Exited* before **Deploy**.
5. **Migrations back up the database.** On start, the server runs `python -m app.server migrate`. When the schema needs updating it first copies the database to `/data/backups/suparagent-<old revision>-<time>.db`, then upgrades it. The log says *Copied the database to …* and *Database ready at revision …*.

## Undoing a release

- **Code only:** revert the change on `ui/redesign` (`git revert`) and release that; it deploys like any other release. For an immediate fix, Coolify keeps the app's earlier images: `suparagent`, **Rollback**, pick the previous one. The next release replaces it.
- **A migration that went wrong:** stop the app, restore the backup from `/data/backups/` over `/data/suparagent.db` (Coolify terminal, or the server), then roll back (Coolify, **Rollback**) to the image of the commit that matches that backup's revision. The backup's file name says which revision it was taken at.

## Where the settings live

- Webhook: GitHub repository **Settings, Webhooks**, the hook to `https://lthops.tech/webhooks/source/github/events/manual` (push events). Coolify checks its signature against the secret saved on each app (**Webhooks** tab); `suparagent` and `suparagent-staging` hold the same one, and each deploys only pushes to its own branch (`main`, `ui/redesign`).
- Branch protection: GitHub repository **Settings, Branches**, the rule for `main` (required check **ci-gate** from GitHub Actions, admins included, no force-push, no deletion).
- Environment variables: each Coolify app has its own. Staging copies production's names; `SUPARAGENT_PUBLIC_URL` and `FRONTEND_ORIGINS` point at staging, and `TOKEN_ENCRYPTION_KEYS` is its own key.
