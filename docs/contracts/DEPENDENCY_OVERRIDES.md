# Dependency Overrides

This file explains the remaining npm overrides that are still admitted into
AAIS after the dependency hardening pass.

Overrides are not normal dependency state.
They are temporary governance shims that stay only while an upstream tree still
resolves an unsafe version.

## Current Rule

- keep an override only when a clean no-override resolution reintroduces a
  vulnerable or explicitly rejected package version
- remove an override as soon as upstream resolves to a safe version without it
- record the reason and expected removal condition here

## Frontend

The frontend no longer requires overrides.

An isolated no-override resolution on 2026-04-29 still produced:

- `follow-redirects 1.16.0`
- `lodash 4.18.1`
- `postcss 8.5.12`

and `npm audit --audit-level=moderate --package-lock-only` reported
`0 vulnerabilities`.

That is why the frontend override block was removed.

## Mobile

The mobile package still requires three overrides today because the Expo 54
dependency tree reintroduces unsafe versions without them.

### `@xmldom/xmldom`

- reason: the no-override tree resolves `@xmldom/xmldom 0.8.13` on the Expo
  config path, while the governed floor is `0.9.10`
- current admitted override: `0.9.10`
- remove when: the Expo / plist / config-plugin tree resolves `>=0.9.10`
  natively

### `postcss`

- reason: the no-override tree resolves `postcss 8.4.49`, and
  `npm audit --audit-level=moderate --package-lock-only` reports the
  moderated-severity advisory on versions `<8.5.10`
- current admitted override: `8.5.12`
- remove when: the Expo Metro/config tree resolves `>=8.5.10` natively

### `uuid`

- reason: the no-override tree resolves `uuid 7.0.3` through `xcode`, and
  `npm audit --audit-level=moderate --package-lock-only` reports the
  moderated-severity advisory on versions `<14.0.0`
- current admitted override: `14.0.0`
- remove when: the Expo config-plugin / xcode tree resolves `>=14.0.0`
  natively

## Removed Override

### `follow-redirects` (mobile)

- result: removed
- reason: the no-override mobile tree already resolves `follow-redirects
  1.16.0`, so the override was no longer carrying real governance weight

## Verification Evidence

The 2026-04-29 no-override probe used isolated temporary installs outside the
live package folders, then checked:

- frontend `npm audit --audit-level=moderate --package-lock-only`
- mobile `npm audit --audit-level=moderate --package-lock-only`

The frontend passed cleanly without overrides.
The mobile tree failed without overrides and justified the remaining three.
