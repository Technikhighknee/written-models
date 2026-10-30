# Testing strategy

## Purpose

Tests protect behavior whose failure would be costly to discover or repair. The
suite should stay small enough to understand, run and maintain. There is no
coverage target, minimum test count or requirement to test every function,
model or change.

The toolbox is a geometry system. Its highest-risk contracts are authored
topology, shared boundaries, selections, UVs, precision, finite contacts and
runtime export. Visual quality is judged on the actual model.

**Model-by-model automated testing is not a project goal.** New models do
not receive tests by default, and there is no requirement to keep a separate
test for every existing model. Test reusable toolbox contracts at their
source. Model-level automation requires a specific, costly regression
that cannot be protected adequately by a smaller shared-capability test.

**Maintenance cost is a reason to delete a test.** If keeping a test current
requires more effort than the failures it realistically prevents, remove
or simplify it. Repeated changes to legitimate artistic or model-specific
decisions are a warning that a test has become a maintenance liability.

## Before adding a test

Answer these questions:

1. **Failure:** What concrete regression could occur?
2. **Consequence:** What breaks if that regression escapes?
3. **Evidence:** Which observable invariant detects it reliably?
4. **Uniqueness:** Is that invariant already protected by an existing test?
5. **Cost:** Is automation worth its execution and maintenance overhead?
6. **Change tolerance:** Will ordinary, intentional model changes trigger
   failures even though no shared contract was broken?

Add a test when the answers demonstrate a meaningful gap. A real regression
with a reusable failure mode is usually stronger evidence than a newly
implemented function. Tests should exercise public behavior or a stable
geometry contract. Prefer the smallest input that reproduces the risk.

Skip automation when the behavior is already covered, manual inspection
is more reliable, or its assertions would merely restate the implementation.
A passing test earns no permanent entitlement to remain in the suite.
On each relevant change, its continued value can be reassessed.

## What deserves automation

### Geometry contracts

Protect operations with consequences for multiple models, especially:

- Manifold boundaries, directed winding, connected components and valid
  authored triangles/quads.
- Shared stations, welded rims and prevention of T-junctions.
- Selection ownership and survival through geometry edits.
- UV seams, surface regions and source-face identity through rendering.
- Physical contact, clearance and precision at supported boundary cases.
- Explicit failures for dangerous inputs that could silently corrupt geometry.

Use small constructed fixtures with measurable invariants. Cover distinct
failure modes; similar parameter variations can share a test or be omitted.

### Compositions

A focused integration test is justified when individually sound operations
can fail at their interface. Examples include a boundary surviving an edit
and subsequent join, or authored UVs surviving a Boolean and export.

Reuse existing composition proofs. Avoid new tests whose main purpose is to
exercise the entire toolbox, finish a project phase or demonstrate that a
temporary model once existed. A new model that uses an existing operation
is generally evidence from actual construction and manual inspection;
it does not automatically create another integration test.

### Runtime and GLB boundaries

Preserve a small number of representative checks for actual data-loss risks:
authored faces reaching Quad View, UV/material data reaching GLB, and
runtime-specific features such as morph targets or instances.

The tankard's fill targets and Godot-compatible UVs are a concrete,
previously observed regression risk. Existing focused tests cover them.
Broad per-model GLB checks would multiply maintenance with little added
protection once the shared exporter is covered. Run a model-specific
diagnostic only when investigating a real failure; do not add an
all-model CI gate.

## What needs human inspection

Model silhouette, proportions, historical character, wear, wood grain,
materials, lighting, artistic seams and perceived quality belong to visual
review. Real Godot imports establish how exported assets behave in the target
engine.

The existing eight models have already undergone manual Godot inspection.
That acceptance stands. A new or materially changed model is accepted
through actual viewer/Godot inspection. A geometry-kernel change may call
for inspecting representative affected models. No automatic test is
required solely because a model exists.

Automated geometric checks can support visual review; they cannot establish
that an asset looks good.

## Test organization and names

- Use `*.test.mjs` and descriptive, lowercase kebab-case filenames.
- Name files after the **capability or behavior under test**.
- Keep related cases together when they share the same contract and setup.
- Split a file when its concerns are genuinely independent.
- Keep fixtures simple, local and readable. Shared helpers must earn their
  maintenance cost.
- Use assertions that reveal the violated invariant when they fail.

Examples of names for retained tests:

- `join-geometry.test.mjs`
- `tankard-fill-export.test.mjs`
- `runtime-export.test.mjs`
- `selection-lifecycle.test.mjs`
- `edit-composition.test.mjs`

Names derived from migration phases (`phase-two-*`, `phase-five-*`, etc.)
are temporary labels. Review their contents before assigning names: some
cases belong in existing capability tests, some merit a specific integration
file, and some add no independent protection.

Comments and test descriptions explain the current contract and the
failure being guarded. They do not serve as a development diary.

## Existing suite: review before changing it

The current repository has **59 `*.test.mjs` files**, including
**12 phase-named integration files**. This is an inventory, not a target
for a particular number of deletions.

Priorities for review:

1. **Model-bound tests:** Start with `phase-two-models`,
   `phase-three-assemblies`, `phase-four-fitted-assemblies` and
   `phase-five-*`. These are prime removal candidates when they assert
   current model dimensions, part counts or artistic choices. Keep a
   model-specific regression only when it addresses a demonstrated,
   costly failure that shared-toolbox tests cannot reasonably catch.
   Move any genuinely reusable invariant to the appropriate capability
   test, if it is not already protected.
2. **Large operation suites:** Inspect the individual cases in
   `bevel-edges.test.mjs`, `join-geometry.test.mjs`,
   `solid-boolean.test.mjs` and other extensive files for unique
   geometric failure modes. Size alone is no reason to delete a test.
3. **Cross-operation integration:** Evaluate
   `phase-six-complex-edits.test.mjs` and `authoring-pipeline.test.mjs`
   against the direct build/edit tests and existing export checks.
4. **Naming:** Rename retained phase-based files to reflect their real
   responsibility, or move individual tests into suitable existing files.
   Avoid moves that only create more structure.

Classify each existing test as **keep**, **consolidate** or **remove**,
with a short, concrete reason. Do not mechanically apply a percentage
reduction. A test that mostly obstructs legitimate model changes should
usually be removed; do not recreate its assertions under a new filename.
Perform the review in small changes that make the resulting suite easier
to understand.

## Running and maintaining tests

The existing verification pipeline is sufficient:

```sh
npm run typecheck
npm test
npm run build
```

For targeted development, run the relevant `node --test <file>` first.
Run the full suite after cleanup or cross-cutting geometry changes. Add
new tooling, dependencies or CI stages only when a demonstrated problem
requires them.

When a test fails, determine whether the contract, implementation or
assertion is wrong before changing anything. It is acceptable to remove
a test whose protection is not worth maintaining; there is no obligation
to replace every deleted test with another test.

**The rule:** The suite must prevent more costly regressions than the
maintenance it creates. Shared capabilities get the strongest protection;
models earn individual automation only by exception.
