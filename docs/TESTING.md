# Testing

> Just because something can be tested doesn't mean it fucking should be.

## Principle

Every test must earn its place.

The purpose of the suite is to catch defects that would otherwise be expensive
to discover and fix. Tests also cost time: they need to be understood, run,
updated and sometimes debugged when the implementation is perfectly fine.

The useful question is whether a test prevents more trouble than it creates.
A passing test can still be a liability. Coverage percentages, test counts and
the existence of a new feature are irrelevant to that decision.

**Adding a test is a choice. Keeping one is a continuing choice.**

## Where tests pay off

The most valuable tests protect reusable geometry contracts. A subtle defect
in the toolbox can spread across many models and remain hidden until export
or later editing.

Prioritize failures with broad consequences or poor visual detectability:

- Invalid topology, face winding or unintended open boundaries.
- Mismatched seams, lost stations and broken welded connections.
- Stale selections or corrupted regions after geometry edits.
- Incorrect source-face identity, UVs or material assignments.
- Wrong finite contacts, clearances or numerical behavior.
- Silent loss of runtime data such as exported morph targets.

Use small geometric examples with clear, measurable expectations. Test a
distinct failure mode once at the lowest sensible level.

A composition test is worthwhile when the interaction between operations
introduces a real risk that isolated tests cannot observe. A representative
export test is worthwhile when data could be lost silently. Neither category
needs exhaustive combinations.

The tankard's morph-target UV failure is a useful example: it happened during
Godot import, was difficult to spot earlier, and exposed a reusable runtime
contract. That regression deserves protection.

## Models are reviewed as models

Models change constantly. Their dimensions, part counts, silhouettes,
surface wear and construction details are creative decisions.

**New models do not automatically get tests.** Routine model acceptance
happens in the viewer and, when relevant, in Godot. The existing eight models
have already been inspected and exported manually.

If a model exposes a toolbox defect, fix the toolbox and consider one focused
test for the underlying failure. A model-specific test is justified only when
it protects an unusually important behavior that cannot be covered reasonably
through the shared code.

Artistic revisions should remain easy. A suite that breaks whenever a table
gets another plank or a handle changes shape is creating work.

## Before writing a test

A proposed test needs a convincing answer to four questions:

1. **What breaks?** Name the specific regression and its consequences.
2. **Why might it escape?** Explain why existing tests or normal inspection
   are insufficient.
3. **What proves correctness?** State an observable invariant independent
   of incidental implementation details.
4. **What will it cost?** Consider fixtures, execution, future design
   changes and the likelihood of false alarms.

If the benefit is uncertain, leave the test out. Temporary checks used while
developing or debugging can be discarded once they have served their purpose.

A bug fix does not automatically require a permanent regression test. Judge
whether the failure is likely to recur and whether the test would be cheaper
than finding it again.

## Removing tests

Tests have no right to exist indefinitely.

Remove tests that duplicate stronger coverage, encode obsolete assumptions,
or repeatedly obstruct legitimate changes. Simplify tests that require
elaborate fixtures to assert something minor. An assertion that merely
repeats a function's implementation rarely provides useful protection.

A deletion does not require a replacement. The remaining risk can be small
enough to accept or better handled by manual review.

When CI fails, identify the broken contract before changing code. Sometimes
the implementation is wrong. Sometimes the expectation has expired. Treat
both possibilities seriously.

## Cleaning up the current suite

The suite grew during the geometry migration. Its structure still reflects
that history, including phase-named integration files and overlapping
model-level checks.

Cleanup should proceed in this order:

1. **Model integration tests:** Review the phase-two through phase-five
   suites first. Remove checks of incidental model structure and redundant
   exports. Retain exceptional runtime regressions with clear value.
2. **Cross-operation tests:** Compare the remaining phase-based integrations
   with the direct toolbox tests. Keep combinations that catch a distinct
   failure.
3. **Large operation suites:** Inspect individual cases in the bevel, join,
   Boolean and related tests. Reduce repeated scenarios while preserving
   meaningful geometric edge cases.
4. **Names and structure:** Name surviving files for their lasting purpose,
   such as `join-geometry.test.mjs` or `tankard-fill-export.test.mjs`.
   Remove phase labels and unnecessary test scaffolding.
5. **Verify:** Run the retained suite, typecheck and build after cleanup.

There is no target number of files to delete. The outcome should be a suite
that is easier to read, cheaper to change and still protective where it
matters.

## Running tests

The existing tools and CI are sufficient:

```sh
npm run typecheck
npm test
npm run build
```

Run relevant tests while working on shared behavior. Run the full suite after
cross-cutting changes and test cleanup. Inspect affected models manually when
their appearance or exported behavior changes.

**A good test suite catches costly mistakes and stays out of the way the rest
of the time.**
