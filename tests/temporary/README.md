# Temporary checks

Disposable experiments and one-off verification scripts go here.

Use `*.check.mjs` instead of `*.test.mjs` to keep them out of the
regular test suite. The dedicated `.github/workflows/temporary.yml`
workflow discovers temporary checks automatically and skips test
execution when none are present.

Delete checks when their investigation is finished. This README stays.
