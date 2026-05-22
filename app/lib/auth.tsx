/**
 * DEPRECATED — this module is a compatibility shim that re-exports the
 * AccountsProvider / useAuth surface from `./accounts.tsx`. The Wave 2D
 * route refactor migrates every call site to `useAccounts()` /
 * `useAccount(serverUrl)` and then deletes this file.
 *
 * Spec: docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md §17.
 */

export { AuthProvider, useAuth } from './accounts';
