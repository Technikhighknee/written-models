# Temporary checks

Disposable experiments and one-off verification scripts go here.

Use `*.check.mjs` instead of `*.test.mjs`. The regular Verify suite
will ignore these files.

The dedicated GitHub Actions workflow,
`.github/workflows/temporary.yml`, automatically discovers and runs all
`*.check.mjs` files in this directory. Push a check and read its result
in **Temporary Checks** under GitHub Actions. When there are no checks,
the workflow skips dependency installation and test execution.

Delete each check when the investigation is finished. This README stays.
