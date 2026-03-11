# Overstory Notes

This file records how Switchyard should use Overstory as a reference without turning into a copy.

## Core Rule

Use Overstory as a source of proven mechanics and failure cases. Do not inherit its scope by default.

Switchyard should aim to surpass Overstory over time, but it should do that by choosing better sequencing and stronger mechanics, not by copying Overstory feature-for-feature as fast as possible.

## Inherit

These ideas are worth reusing unless Switchyard has a strong reason not to:
- canonical repo-root handling across nested directories and git worktrees
- durable repo-local state under a dot-directory
- explicit config loading and normalization
- operator-first CLI behavior with clear failure output
- regression tests for git/path/worktree edge cases
- vertical-slice implementation order for orchestration mechanics

## Defer

These may become relevant later, but they are not early-stage priorities:
- broad runtime abstraction
- coordinator and supervisor processes
- watchdog tiers
- dashboards and TUIs
- merge queue workflows
- ecosystem bootstrapping of sibling tools

Deferred here means "not yet," not "never."

## Reject By Default

These should not enter Switchyard unless the need becomes concrete:
- Bun-specific runtime or tooling assumptions
- Claude-specific workflow assumptions in core architecture
- hidden automation that mutates repo state behind the operator's back
- complex multi-runtime design before Codex-first behavior is solid

## Current Switchyard Translation

Overstory suggests a few concrete rules for this repo:
- keep `.switchyard/` state anchored to the canonical repo root, not the active worktree
- prefer tests around git behavior before adding more orchestration features
- keep `init` lightweight and move database schema ownership into store modules
- build the first usable loop before expanding command breadth

The intended translation is:
- first beat Overstory on clarity and reliability in the narrow loop
- then widen scope deliberately
- only adopt broader orchestration features when Switchyard can carry them with less operator overhead than the Overstory-inspired baseline

## When To Update This File

Update this document when:
- a major Switchyard design choice is borrowed from Overstory
- a tempting Overstory feature is explicitly deferred
- a previous assumption is rejected after implementation experience
