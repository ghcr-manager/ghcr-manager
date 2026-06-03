# Test Package Setup

This document records the intended external setup for GHCR live test execution in dedicated test package namespaces.

## Purpose

Use separate test package namespaces for destructive and scenario-based GHCR tests so test packages do not appear under
the main repository's package list.

Current intended organization:

- `gh-workflow-test`

## Configuration Names

Use these repository-level configuration names:

- variable: `GH_TEST_ORG`
- variable: `GH_TEST_PAT_USERNAME`
- secret: `GH_TEST_PAT`

Recommended value mapping:

- `GH_TEST_ORG=gh-workflow-test`
- `GH_TEST_PAT_USERNAME=<username that owns GH_TEST_PAT>`
- `GH_TEST_PAT=<classic PAT for a user that can administer packages in gh-workflow-test>`

Current workflow expectation:

- the GHCR live test workflows require both values
- the GHCR live test workflows also require `GH_TEST_PAT_USERNAME`
- they fail fast when either value is missing
- they do not fall back to the repository owner namespace

## Token Type

Use a classic personal access token for now.

Required package scopes:

- `read:packages`
- `write:packages`
- `delete:packages`

Notes:

- The token owner needs permission to create, update, and delete GHCR packages in `gh-workflow-test`.
- Keep this token scoped to test-package workflows only.
- `GH_TEST_PAT_USERNAME` must match the user account that owns `GH_TEST_PAT`.

## Ownership Model

When test package configuration is enabled, live scenario workflows publish and mutate packages under the configured
test owner rather than the repository owner.

Intended behavior:

- publish scenario packages to `ghcr.io/<GH_TEST_ORG>/...`
- delete scenario packages via the org-scoped GitHub Packages API for `GH_TEST_ORG`
- scan and execute against packages owned by `GH_TEST_ORG`
- when a workflow runs with a user-owner mode, it seeds and mutates packages owned by `GH_TEST_PAT_USERNAME`
