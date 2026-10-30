# Testing

> Just because something can be tested doesn't mean it fucking should be.

## Purpose

Tests exist to catch important regressions before they become expensive to
find and fix. They also impose costs: execution time, test fixtures, false
alarms and maintenance whenever the code evolves.

**A test belongs in the suite only while its protection justifies those
costs.** A passing test is not automatically a useful test. There are no
coverage targets, test-count goals or requirements to accompany every
change with a test.

The goal is a dependable geometry toolbox and the freedom to keep building
models without maintaining a second implementation in the test suite.

## What to test

### Shared geometry contracts

Prioritize behavior that many models depend on, especially when errors
can produce plausible-looking but invalid geometry:

- **Topology:** intended closed surfaces have no open edges or invalid
  face connections; deliberately open surfaces preserve their boundaries.
- **Construction:** adjoining pieces retain matching boundary vertices,
  consistent winding and the requested geometric shape.
- **Editing:** operations preserve valid selections, regions and surface
  data, or explicitly report when they cannot.
- **Spatial queries:** fitting and clearance use actual finite surfaces
  and consistent physical units.
- **Rendering and export:** authored faces, UV coordinates, material
  regions and required runtime data survive conversion.
- **Numerical safety:** unsupported or degenerate inputs fail clearly,
  without silently producing corrupted geometry.

Choose a small input and assert the relevant invariant. Add another case
only when it represents a different failure mode.

### Operation boundaries

A limited number of integration tests can protect interactions that
individual operation tests cannot verify. For example, a surface edited
by one operation may need to remain usable by a subsequent operation.

Such a test should protect a specific interface contract. Combining more
operations merely to increase the scope of a test adds complexity without
necessarily increasing confidence.

### Runtime behavior

Test serialized or exported data when a failure could be silent or costly.
Relevant properties may include the presence of UV attributes, material
assignments, animation data or morph targets in an exported asset.

Use representative inputs to verify shared export behavior. Full exports
of every model are unnecessary unless a particular model has an exceptional
runtime contract that merits its own regression test.

## Model acceptance

Models are evaluated as visual assets. Their proportions, materials,
surface details and construction choices are expected to change.

New models do not require automated tests. Review their geometry and
appearance in the viewer, and inspect exported assets in the target engine
when applicable. Recheck the affected parts when a relevant change occurs.

A defect discovered while building a model should normally lead to a fix
in the reusable operation responsible for it. Add a focused test for that
operation if the failure risk warrants one.

Model-specific tests are reserved for behavior that is important, easy to
break unnoticed and impractical to protect through shared-toolbox tests.
Normal artistic decisions and incidental part counts are not stable test
contracts.

## Deciding whether a test is worth writing

Before adding a permanent test, determine:

1. **Risk:** What concrete defect could occur?
2. **Impact:** What would that defect break, and how costly would it be
   to discover later?
3. **Detection:** Can an assertion reliably distinguish the defect from
   valid changes?
4. **Overlap:** Is that risk already covered by another test or by normal
   inspection?
5. **Maintenance:** Will the test remain understandable and inexpensive
   as the implementation evolves?

When the answers do not establish a clear benefit, skip the test.

A temporary diagnostic can be useful during development without becoming
a permanent test. A bug fix likewise does not require a regression test
unless recurrence and impact make the ongoing cost worthwhile.

## Keeping the suite maintainable

Review existing tests by the same criteria used for new ones.

- Remove duplicated assertions and tests for obsolete behavior.
- Remove tests that regularly fail because of intentional design changes.
- Consolidate related cases when doing so improves clarity.
- Keep fixtures minimal and assertions focused on observable behavior.
- Delete tests outright when their remaining benefit is too small.

Removal does not require a replacement. An acceptable risk can be handled
through inspection or left unautomated.

When a test fails, investigate the implementation and the expectation.
Fix the actual defect, or update/remove an assertion whose contract no
longer applies. The purpose of CI is to reveal problems worth fixing.

## Organization

Name files for the capability or behavior they verify, using descriptive
lowercase kebab-case names such as `join-geometry.test.mjs` or
`surface-clearance.test.mjs`.

Keep related cases together. Split files when they cover independent
responsibilities. Avoid names based on development phases, dates or
temporary implementation milestones.

Test descriptions and comments should explain the current behavior under
test. They must make sense without knowing the history of the project or
the conversation in which a test was introduced.

## Verification

Use targeted tests while working on a particular shared contract. Run
the full suite after cross-cutting changes and test-suite maintenance.

```sh
npm run typecheck
npm test
npm run build
```

Automated checks complement visual and target-engine inspection when an
asset needs it.

**The suite should catch costly mistakes and stay out of the way the rest
of the time.**
