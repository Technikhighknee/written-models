# Temporary checks

Disposable experiments and one-off verification scripts go here.
Use `*.check.mjs` so the regular Node test discovery in `npm test`
ignores these files.

The repository's tests execute through GitHub Actions
(`.github/workflows/verify.yml`). To exercise a temporary check, add
a temporary step to the Verify job such as:

```yaml
- run: node --test tests/temporary/geometry-probe.check.mjs
```

Commit and push the check and workflow change, then inspect the CI logs.
When the investigation is finished, delete the check and remove its
CI step. Leave this directory empty apart from this README.
