// Explicitly classify archived SQL suites. A new file must be reviewed, not
// silently executed with bot migrations or silently omitted from coverage.
export const retainedPostgresSuites = [
  'account-mutations', 'admin', 'announcement-mutations', 'app-content-notifications',
  'auth-email', 'auth-profiles', 'auth-sessions', 'billing-runtime', 'dashboard-bases', 'dashboard-discord-cache',
  'dashboard-roster-ai-context', 'dashboard-roster-ai-usage', 'dashboard-roster-automation-ownership',
  'dashboard-roster-bonuses', 'dashboard-roster-snapshots', 'dashboard-roster',
  'dashboard-server-activity', 'dashboard-server-link-concurrency', 'dashboard-server-link-policy',
  'dashboard-server', 'discord-coordination', 'discord-credentials', 'initialization', 'link-mutations',
  'mobile-achievements', 'mobile-persistence', 'moderation-runtime', 'public-clan-extra',
  'public-data', 'public-metadata', 'public-player-extra', 'stats-archive', 'stats-battlelogs',
  'stats-cwl-archive', 'stats', 'tracking-operations', 'war-exports',
].map(name => `${name}.test.ts`)

export const deferredPostgresSuites = [
  'dashboard-roster-configuration', 'giveaway-publications', 'giveaway-runtime',
  'roster-board-delivery', 'roster-interaction-board', 'roster-interaction-confirm',
  'roster-interaction-delivery', 'roster-interaction-effects', 'roster-interaction-forms',
  'roster-interaction-prepare', 'roster-membership-lock', 'roster-operation-status',
  'roster-role-audit', 'roster-role-late-write', 'roster-signup-admission',
  'roster-signup-eligibility', 'roster-stale-role-delivery', 'runtime-recovery',
  'server-scoped-linking', 'ticket-account-link-form', 'ticket-account-runtime',
  'ticket-approval-resolver', 'ticket-approval', 'ticket-category-retry',
  'ticket-effect-guild-scope', 'ticket-effects', 'ticket-notifications',
  'ticket-panel-publications', 'ticket-runtime', 'ticket-staff',
].map(name => `${name}.test.ts`)

export function validatePostgresInventory(files) {
  const classified = [...retainedPostgresSuites, ...deferredPostgresSuites]
  if (new Set(classified).size !== classified.length) throw new Error('Duplicate SQL suite classification')
  const missing = classified.filter(file => !files.includes(file))
  const unknown = files.filter(file => !classified.includes(file))
  if (missing.length || unknown.length) throw new Error(`SQL suite inventory differs: missing=${missing.join(',')}; unclassified=${unknown.join(',')}`)
  return retainedPostgresSuites
}
