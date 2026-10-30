# Temporary checks

Disposable experiments and one-off verification scripts go here.

Use `*.check.mjs` (not `*.test.mjs`) so `npm test` does not discover them.
Run a check explicitly with `node --test tests/temporary/<name>.check.mjs`.
Delete it when its investigation is finished. The folder stays empty by default.
