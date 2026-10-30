# Testing strategy

## Objective

The test suite exists to keep the geometry toolbox dependable as it grows.
Its value is measured by the serious regressions it catches relative to the
effort required to maintain it.

I prioritize correctness at shared boundaries: authored topology, geometry
editing, selection ownership, finite contacts, numerical precision, UVs and
runtime export. A failure there can affect many models without being obvious
in the viewer.

I will keep the suite deliberately small. Every test is an ongoing maintenance
commitment. Coverage percentages, test counts and the number of modeled
assets have no role in deciding how much automation we need.

## Where I invest in tests

### Shared geometry

The kernel and reusable operations carry the highest risk. Focused tests
should establish contracts such as:

- A solid stays manifold, with valid face winding and connected components.
- Shared boundaries retain their actual vertices and matching stations.
- An edit preserves valid selections, regions, UV seams and source-face
  identity where the operation promises to preserve them.
- Fitting and clearance use finite geometry and meaningful world units.
- Unsupported or numerically unsafe inputs fail without corrupting the
  original geometry.
- Render triangulation and Quad View agree on the authored faces.

Use compact fixtures and geometric assertions. A failure should identify the
broken contract. For complex operations, cover distinct failure classes
rather than enumerating every variation of a valid input.

### Interfaces between operations

A small number of integration tests should cover boundaries where correct
operations can fail when combined: for example, cutting and rejoining a
selected surface, or carrying authored UVs through geometry compilation.

Select cases that expose genuinely new risk. Existing component tests and
composition tests count as evidence. A new model or implementation milestone
does not create an additional testing obligation.

### Runtime features

Preserve targeted checks for export behavior that is easy to break silently,
including material/UV transfer and morph-target data.

The tankard's fill morph is a good example. Its Godot import exposed a real
UV problem, and its active fill behavior has a specific runtime contract.
Those risks justify focused regression coverage.

The shared runtime exporter should be verified with representative inputs.
Running every model through the exporter on every change would add little
confidence beyond that shared coverage.

## Model development

Models are primarily evaluated as assets. I inspect their geometry, Quad
View, appearance and relevant GLB/Godot behavior as part of making them.

I do not create automated tests for each model. Dimensions, board counts,
decorative details, proportions and other authored design decisions change
through ordinary iteration. Tests coupled to those details introduce
maintenance work without protecting the toolbox.

A model-specific regression test earns its place when a concrete,
significant failure has occurred, can recur unnoticed, and cannot be guarded
economically at the shared-toolbox level.

The existing eight models have already been inspected and exported manually.
That acceptance remains valid. I will repeat targeted inspection when
changes affect the relevant behavior.

## Decision to add or keep a test

Before introducing automation, I establish:

1. **Risk:** The specific failure it is intended to catch.
2. **Impact:** The practical cost of that failure escaping.
3. **Signal:** An observable assertion that distinguishes correct behavior
   from the regression.
4. **Coverage:** Whether an existing test already provides that signal.
5. **Lifetime cost:** The expected effect of legitimate changes on the test,
   its fixtures and its execution time.

I add the test when its expected protective value clearly exceeds that cost.
The same standard applies during maintenance. A passing test can become
obsolete. Repeated updates caused by normal model edits are a strong reason
to remove it.

Deleting a low-value test is a complete maintenance decision. It does not
create a requirement to replace the test elsewhere.

## Organization

Files are named for the capability or behavior they cover, in lowercase
kebab-case: `join-geometry.test.mjs`, `selection-lifecycle.test.mjs`,
`tankard-fill-export.test.mjs`.

Keep related cases together and their setup readable. Shared helpers are
appropriate when they remove meaningful repetition. Test names describe
the invariant being protected. Comments explain the current contract.

Migration-phase labels have no place in the permanent suite. Names such as
`phase-five-chair.test.mjs` tell us when a test was written and become
meaningless as the system evolves.

## Cleanup of the existing suite

The current suite has 59 test files, including 12 integration files named
after development phases. I will review their assertions before editing the
suite, using the following order.

1. **Model-specific integration tests.** Examine the phase-two through
   phase-five files and identify assertions tied to particular models.
   Remove routine construction and export checks already covered by the
   toolbox. Preserve only model-specific failure modes that justify their
   upkeep.
2. **Overlapping compositions.** Compare the phase-six integration cases
   and `authoring-pipeline.test.mjs` with focused build, edit and runtime
   coverage. Retain the smallest set of distinct integration risks.
3. **Shared operations.** Review the large bevel, join, Boolean and other
   capability suites case by case. Keep meaningful boundary conditions;
   consolidate redundant permutations. File length alone does not decide.
4. **Names and structure.** Rename remaining phase-based tests by behavior
   and move cases only where that improves ownership and readability.

Each decision should be traceable to a particular contract or a concrete
maintenance burden. I will avoid arbitrary reduction targets and avoid
introducing replacement tests simply to preserve the old test count.

## Execution

Use the existing tooling:

```sh
node --test tests/geometry/build/join-geometry.test.mjs
npm run typecheck
npm test
npm run build
```

During development, run affected tests first. Run the full suite for changes
to shared geometry behavior and after test-suite cleanup. The existing CI
pipeline is sufficient.

A failing test triggers investigation of the contract, implementation and
assertion. Fix the defect when the contract is sound. Update or remove the
test when its expectation has outlived the design.

## Standard of success

I want a suite that gives a useful warning when the toolbox breaks and
otherwise stays out of model development. If maintaining the suite starts
costing more than the regressions it prevents, I will reduce it.

That is the governing constraint for every test decision.
