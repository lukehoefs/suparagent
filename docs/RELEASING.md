# Releasing lukethomas

How a change gets from a branch to the live server at https://agent.lthops.tech, with a staging copy and automatic tests on the way. Both servers run on the same Coolify host, in the `suparagent` project.

| | Production | Staging |
|---|---|---|
| Address | https://agent.lthops.tech | https://staging.lthops.tech |
| Coolify app | `suparagent` (environment `production`) | `suparagent-staging` (environment `staging`) |
| Branch it builds | `main` | `ui/redesign` |
| Deploys | by hand: **Stop**, then **Deploy** | on every push to `ui/redesign`, by itself |
| Data | its own `/data` volume | its own `/data` volume, never production's |

Staging has its own database, encryption key and accounts. Nothing you do there touches the real agents. The first person to open a fresh staging server becomes its owner, so claim it as soon as it is created.

## The flow

1. **Work on a branch.** Make the change on `ui/redesign`, or on a branch that merges into it.
2. **Tests run on GitHub.** Every push to `main` or `ui/**`, every pull request, and a manual run (Actions, **CI**, **Run workflow**) start the CI workflow at https://github.com/lukehoefs/suparagent/actions. It runs only the parts that changed: backend tests on SQLite and PostgreSQL, the sandbox and smoke tests, the frontend lint, tests and build, mobile and desktop. A change to `.github/workflows/ci.yml` runs all of them. On Windows about 100 backend tests fail for reasons unrelated to the code (POSIX signals, Unix sockets, symlinks), so CI on Linux is the reference.
3. **Staging updates itself.** A push to `ui/redesign` sends a signed webhook from GitHub to Coolify, which rebuilds `suparagent-staging` (about 5 to 8 minutes). Try the change at https://staging.lthops.tech.
4. **Release to production** when CI is green and staging looks right:
   1. Fast-forward `main` to the tested commit: `git push origin ui/redesign:main`. This refuses to overwrite anything that is not already in `ui/redesign`.
   2. In Coolify, open `suparagent`, click **Stop**, wait until it shows *Exited*, then click **Deploy**.
   3. Check `https://agent.lthops.tech/api/v1/health` answers `{"status":"ok"}`.

   Production never deploys by itself (its auto-deploy is off). It uses one SQLite file, and Coolify's rolling update would start the new container, and run its migrations, while the old one still has the database open. **Stop** first avoids that.
5. **Migrations back up the database.** On start, the server runs `python -m app.server migrate`. When the schema needs updating it first copies the database to `/data/backups/suparagent-<old revision>-<time>.db`, then upgrades it. The log says *Copied the database to …* and *Database ready at revision …*.

## Undoing a release

- **Code only:** in Coolify, deploy the previous commit of `main` (Stop first).
- **A migration that went wrong:** stop the app, restore the backup from `/data/backups/` over `/data/suparagent.db` (Coolify terminal, or the server), then deploy the commit that matches that backup's revision. The backup's file name says which revision it was taken at.

## Where the settings live

- Webhook: GitHub repository **Settings, Webhooks**, the hook to `https://lthops.tech/webhooks/source/github/events/manual` (push events). Coolify checks its signature against the secret saved on `suparagent-staging` (**Webhooks** tab). Production has no secret and auto-deploy off, so the hook never deploys it.
- Environment variables: each Coolify app has its own. Staging copies production's names; `SUPARAGENT_PUBLIC_URL` and `FRONTEND_ORIGINS` point at staging, and `TOKEN_ENCRYPTION_KEYS` is its own key.
