# Spec: <feature name>

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

<!-- A one-sentence name of the feature. -->

## Overview

<!-- A short explanation of what the feature is, who uses it (which KWM role) and why it is needed. -->

## Backend dependency

<!-- The backend work this relies on. Write "None" if the feature is frontend only. -->

- Backend ticket / MR: 
- Backend spec in `kiuru-mssp/specs/<file>.md`: 

## Interface

### UI

<!-- Describe behavior change -->

### API contract

<!-- New backend API's required? Breaking changes? -->


### Permissions

<!-- The access rights that show, hide or disable each part of the UI, and the permission helper that checks them (src/helpers/permissions/). The backend must enforce the same rights. -->

| UI element | Access right | Without the right |
|---|---|---|
|  |  | hidden / read-only / disabled |

### Config

<!-- Does this require config changes? -->

## Acceptance criteria

<!-- A list of testable conditions that define when the feature is complete. -->

- [ ] 

## Out of scope

<!-- What the feature doesn't define. -->

- 

## Edge cases

<!-- Unusual or boundary situations the feature must handle. Delete the lines that do not apply. -->

<!-- - Loading, empty result, and backend error (4xx, 5xx, timeout) states -->
<!-- - User clicks twice, or navigates away while a request is still running -->
<!-- - Large result sets: paging, sorting, filters --> 
<!-- -Long values or unexpected characters in names, MSISDNs, certificates -->
<!-- - User has only some of the required access rights -->


## Security impact

<!-- How the feature affects security: new data shown or exported, data placed in URLs or browser storage, new dependencies, changes to what each role can see or do. Say where the backend enforces it. -->

## Threat modeling

<!-- How the feature could be attacked or misused, and how each threat is mitigated. -->

| Threat | Mitigation |
|--|---|
|  |  |
