# Testing

## Purpose

The test suite protects the contracts that allow written-models to construct,
edit and export reliable geometry. Tests are investments in stability. Their
maintenance, complexity and execution time are part of their cost.

A smaller suite with clear responsibilities is preferable to a large suite
that repeatedly checks the same behavior. There are no coverage targets,
test quotas or requirements to add tests with every feature or model.

The governing rule is simple: **a test must prevent enough likely, costly
failure to justify keeping it.**

## What to protect

### Geometry contracts

The reusable toolbox is the primary target for automated verification.
Failures here can propagate into many otherwise unrelated models.

High-value invariants include:

- Valid face winding, manifold topology and deliberate open boundaries.
- Exact boundary correspondence, welding and absence of unintended gaps
  or T-junctions.
- Stable selection ownership through edits and compositions.
- Correct surface regions, authored quads, UV seams and render provenance.
- Finite geometric contacts, consistent units and numerical precision.
- Explicit failure for unsupported or destructive inputs.

Test those properties with small, understandable geometries. Each case
should have a clear geometric expectation and exercise a distinct risk.
Extensive permutations are warranted only where they expose different
failure modes.

### Interfaces and export

Some regressions only appear when individually correct operations are
combined. Preserve a few representative integration tests where that
boundary is particularly fragile: for example, cutting a surface before
joining it, or preserving authored UVs through the runtime exporter.

Runtime-specific behavior deserves focused coverage when losing it would
be hard to notice. The tankard's fill morphs and their Godot-compatible
UVs qualify because a real import failure exposed that risk.

Shared export behavior should be tested through representative geometry
and materials. A full GLB export of every model on every change does not
provide enough additional confidence to justify the maintenance.

## Models and visual acceptance

Models are the output of the system and are routinely changed for artistic
reasons. **A model does not require an automated test simply because it
exists.**

Silhouette, proportion, wear, material appearance and overall quality are
reviewed in the viewer and, where relevant, Godot. Model-specific sizes,
piece counts and decorative arrangements are free to evolve without
triggering unrelated test failures.

When building a model exposes a defect in a reusable operation, fix and
verify the shared operation. Keep a model-specific regression only when
there is a concrete, costly failure that cannot reasonably be covered at
that level. The tankard's active fill/export behavior is such an exception.

The eight existing models have already undergone manual Godot inspection.
That acceptance stands. Future inspection is scoped to the assets and
behaviors affected by a change.

## Adding a test

Before committing a new test, establish all of the following:

1. **Failure mode:** What specific incorrect behavior could escape?
2. **Consequence:** Why would discovering it later be costly?
3. **Independent signal:** What assertion would reliably catch it?
4. **Existing coverage:** Why is the current suite insufficient?
5. **Maintenance:** Will legitimate development leave the assertion
   meaningful, with reasonable setup and execution cost?

If these questions have no convincing answers, skip the test. A temporary
diagnostic used to develop or debug a feature need not become permanent
test infrastructure.

Prefer invariants and observable outcomes over exact implementation details.
A brittle test that must be repaired whenever an asset is adjusted is a
liability even when it passes.

## Maintaining the suite

Passing tests are reviewed by the same standard as new tests. Remove
redundant assertions, obsolete expectations and tests whose ongoing cost
exceeds their protection. Deletion does not require a replacement test when
the original risk is acceptably covered elsewhere or by manual inspection.

When a test fails, first identify whether the failure represents a broken
contract, an intentional design change or an incorrect assertion. Change
the implementation or the test according to that finding. Never preserve
an outdated expectation merely to maintain a test count.

Use the smallest practical fixtures and straightforward assertions.
Complex shared test helpers need a clear benefit. Tests should be readable
without reconstructing the history of the project.

## Files and names

Organize tests around stable capabilities and behavior. Descriptive names
such as `join-geometry.test.mjs`, `surface-clearance.test.mjs` and
`tankard-fill-export.test.mjs` make their responsibility discoverable.

Development phases are temporary. Files named `phase-two-*` through
`phase-six-*` should be examined and either removed, consolidated or
renamed for the behavior they actually protect. The same applies to any
test that has become an implementation diary.

Keep related cases together. Split a file when it contains genuinely
independent concerns, rather than creating a new file for each regression.

## Existing-suite cleanup

The current suite accumulated tests during the geometry-kernel migration.
It should be reduced deliberately:

1. Review the model-oriented integration suites first. Eliminate repeated
   model construction, part-count, shape and GLB assertions where reusable
   geometry and runtime contracts already provide adequate protection.
2. Review the large geometry-operation files case by case. Retain distinct
   boundary conditions and regressions; consolidate repetitions.
3. Review cross-operation tests against their component coverage. Keep
   only combinations that add a meaningful failure signal.
4. Rename and reorganize retained tests around capabilities. Keep file
   ownership obvious and minimize helper infrastructure.
5. Run the remaining suite, typecheck and build to verify the cleanup.

No predetermined deletion percentage or target test count is useful.
The end state should be understandable, economical and capable of catching
the failures that matter.

## Execution

The existing commands and CI workflow are sufficient:

```sh
npm run typecheck
npm test
npm run build
```

During development, run relevant tests when shared contracts change or
a specific regression needs investigation. Use the full suite for
cross-cutting changes and after suite maintenance. Manual visual review
remains part of asset work.

**The suite succeeds when it catches important regressions and otherwise
stays out of the way of building models.**
