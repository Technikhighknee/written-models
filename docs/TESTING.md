# Testing

> Just because something can be tested doesn't mean it fucking should be.

## Why this exists

We're building a geometry toolbox and the models it makes possible.
We're not building a monument to automated testing.

Tests should catch expensive mistakes before they spread. Every test also
costs something: time to write, fixtures to maintain, failures to investigate
and assumptions that can outlive the code they describe.

**If a test creates more work than the bugs it prevents, it needs to go.**
A green checkmark doesn't make it valuable. Neither does a clever assertion,
a new feature or an impressive test count.

## Test the dangerous stuff

A bug in a shared geometry operation can quietly break dozens of models.
That's where automation earns its keep.

Protect contracts that are hard to verify by eye and costly to break:

- **Topology:** Closed solids stay closed. Open boundaries are deliberate.
  Faces have valid winding and connections.
- **Construction:** Pieces that are supposed to meet actually share the
  right boundaries. No missing stations, accidental gaps or T-junctions.
- **Editing:** Selections, regions and surface data survive operations
  that promise to preserve them.
- **Spatial queries:** Contacts, clearances and distances describe real,
  finite geometry in consistent units.
- **Export:** Authored faces, UVs, materials and required runtime data
  survive conversion.
- **Failure handling:** Unsupported or degenerate inputs fail clearly
  instead of silently producing garbage.

Use the smallest geometry that proves the contract. Test distinct ways
it can fail. There's no prize for testing the same thing twenty times.

## Stop testing every damn model

Models are meant to change. Their dimensions, silhouettes, details and
materials are design decisions, not permanent assertions.

**A new model does not need a test.** Building one doesn't earn it a test
file, and changing one shouldn't send CI into a meltdown because a board
moved five centimeters.

Inspect models in the viewer. Inspect exported assets in the target engine
when necessary. That's how visual quality and actual appearance are judged.

When a model exposes a reusable geometry bug, fix the shared operation.
Consider a focused regression test there if the risk justifies it.

Model-specific automation is an exception for important behavior that
could fail silently and cannot reasonably be covered by shared tests.
An exported morph target is a possible example: the useful assertion
checks that required runtime data is present and correct, regardless of
the model's appearance.

## Integration tests aren't trophies

Some bugs live between otherwise correct operations. A focused integration
test can protect one of those boundaries.

That's enough. A growing chain of operations isn't automatically a better
test. Running every model through every export path doesn't automatically
make the system safer.

**One clear failure signal beats ten overlapping demonstrations.**

## Before adding a test

Answer these questions:

1. **What breaks?** Name a specific failure and why it matters.
2. **Why won't we catch it otherwise?** Check existing coverage and
   ordinary inspection.
3. **What proves it?** Assert observable behavior, not implementation
   details or today's artistic choices.
4. **What will it cost?** Count future maintenance, brittle fixtures,
   runtime and false alarms.

If the answers are weak, **don't write the test**.

Debugging experiments and one-off verification scripts belong in
`tests/temporary/`. Keep that folder out of the regular test suite: use
names like `geometry-probe.check.mjs`, run them explicitly with
`node --test tests/temporary/geometry-probe.check.mjs`, and delete them
when the investigation is done. The folder stays; its contents shouldn't.
Fixing a bug doesn't automatically entitle it to a permanent regression
test either.

## Kill tests that have outlived their usefulness

Tests aren't sacred. Reevaluate them when the code changes.

- Duplicate coverage? Remove it.
- Obsolete behavior? Remove it.
- A fixture more complicated than the behavior it checks? Simplify it
  or remove it.
- Breaks every time a model is legitimately redesigned? Remove it.
- Still catches a serious, distinct regression cheaply? Keep it.

**Deletion doesn't create a debt to write another test.** Acceptable risks
can remain unautomated.

When CI fails, find out whether the code violated a real contract or the
test is clinging to an outdated assumption. Fix whichever is wrong.
Don't bend working code to appease a bad test.

## Names should tell us something

Use descriptive, lowercase kebab-case filenames based on the behavior
being protected: `join-geometry.test.mjs`,
`surface-clearance.test.mjs`, `runtime-export.test.mjs`.

Names like `phase-five-something.test.mjs` are useless once that phase is
over. Test files aren't diary entries. Comments shouldn't require someone
to know when, why or in which conversation the code was written.

Keep related cases together. Split them when they have genuinely different
responsibilities, not because another file looks tidy.

## Keep the suite lean

When cleaning up existing tests:

1. Start with per-model checks. Remove incidental dimensions, part counts
   and repeated export smoke tests.
2. Compare integration tests with the shared-operation tests they overlap.
   Keep only the combinations that catch something genuinely different.
3. Review large suites case by case. Preserve meaningful edge cases;
   cut repetitive permutations.
4. Give survivors useful names and straightforward fixtures.
5. Run the remaining suite, typecheck and build.

There's no deletion quota. The result should be less work to maintain
without losing protection against the failures that matter.

## Run what's relevant

The existing tooling is enough:

```sh
npm run typecheck
npm test
npm run build
```

During development, run the tests relevant to the shared behavior being
changed. Run the full suite after broad changes or test cleanup. Review
visual assets visually.

**Tests are here to protect the work. The work is not here to feed the tests.**
