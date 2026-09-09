import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"

const destination = resolve(".local/scoped-import")
mkdirSync(destination, { recursive: true, mode: 0o700 })
const users = "('706149153431879760','506210109790093342')"
const servers = "('923764211845312533','684667214347108386')"
const clans = "('#2VC0Q9LV','#2GYQ8YY2V','#VY2J0LL')"
const quote = value => '"' + value.replaceAll('"', '""') + '"'
function remote(sql) {
  return execFileSync("ssh", ["root@152.53.82.182", "docker exec -i timescale-qsj8dfwekv4uw7ri76r9bhcx-044219017574 sh -c 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d clashking'"], {
    input: `BEGIN READ ONLY; SET LOCAL statement_timeout='120s';\n${sql}\nROLLBACK;`, encoding: "utf8", maxBuffer: 512 * 1024 * 1024,
  }).trim()
}
const linked = `SELECT tag FROM player_links WHERE user_id::text IN ${users}`
const clanTags = `SELECT tag FROM server_clans WHERE server_id::text IN ${servers} UNION SELECT unnest(ARRAY${clans.replaceAll("(", "[").replaceAll(")", "]")})`
const cwl = `SELECT cwl_id FROM cwl_group_clans WHERE clan_tag IN ${clans}`
const warIds = `SELECT war_id FROM wars WHERE clan_tag IN ${clans} OR opponent_tag IN ${clans} UNION SELECT unnest(war_ids) FROM player_war_history WHERE player_tag IN (${linked})`
const predicates = {
  servers: `id::text IN ${servers}`,
  basic_clan: `tag IN (${clanTags}) OR tag IN (SELECT clan_tag FROM basic_player WHERE tag IN (${linked}))`,
  basic_player: `tag IN (${linked}) OR clan_tag IN ${clans}`,
  player_links: `user_id::text IN ${users}`,
  player_links_settings: `server_id::text IN ${servers} OR tag IN (${linked})`,
  cwl_groups: `cwl_id IN (${cwl})`,
  cwl_group_clans: `cwl_id IN (${cwl})`,
  cwl_group_members: `cwl_id IN (${cwl})`,
  cwl_standings: `cwl_id IN (${cwl})`,
  wars: `war_id IN (${warIds}) OR (war_type='cwl' AND war_tag IN (SELECT jsonb_array_elements_text(jsonb_path_query_array(rounds, '$.** ? (@.type() == "string")')) FROM cwl_groups WHERE cwl_id IN (${cwl})))`,
  player_war_history: `player_tag IN (${linked})`,
  roster_members: `roster_id IN (SELECT id FROM rosters WHERE server_id::text IN ${servers})`,
  roster_automation_executions: `roster_id IN (SELECT id FROM rosters WHERE server_id::text IN ${servers})`,
  roster_ai_usage_credits: `usage_id IN (SELECT id FROM roster_ai_usage WHERE server_id::text IN ${servers})`,
  roster_ai_usage_sponsors: `usage_id IN (SELECT id FROM roster_ai_usage WHERE server_id::text IN ${servers})`,
  autoboard_targets: `autoboard_id IN (SELECT id FROM autoboards WHERE server_id::text IN ${servers})`,
  ticket_panel_staff_permissions: `panel_id IN (SELECT id FROM ticket_panel WHERE server_id::text IN ${servers})`,
  achievement_player_awards: `player_tag IN (${linked})`,
}
predicates.war_archive_pending = `war_id IN (SELECT war_id FROM wars WHERE ${predicates.wars})`
predicates.war_archive_packs = `pack_id IN (SELECT archive_pack_id FROM wars WHERE ${predicates.wars} UNION SELECT pack_id FROM war_archive_pending WHERE ${predicates.war_archive_pending})`
const excluded = new Set(['auth_discord_tokens','auth_refresh_tokens','auth_email_verifications','auth_password_reset_tokens','mobile_push_devices','mobile_notification_deliveries','billing_webhook_events'])
// Explicit non-credential business-data scope. Never export provider secrets,
// login sessions/password hashes, billing records, or executable delivery jobs.
const allowed = new Set(`servers basic_clan basic_player player_links player_links_settings
user_settings user_bookmarks user_recent_searches player_upgrade_preferences player_upgrades
player_profile_details player_timers player_war_history player_change_history player_online_events
player_rankings_current player_stat_changes battlelogs join_leave_history legend_history
legend_rankings_current ranked_league_group_members achievement_player_awards
clan_change_history clan_rankings_current clan_records cwl_bonus_recipients cwl_group_clans
cwl_group_members cwl_groups cwl_league_history cwl_standings
leaderboard_history_clan_builder_base leaderboard_history_clan_capital leaderboard_history_clan_home
leaderboard_history_player_builder_base leaderboard_history_player_home
server_autoeval_triggers server_bans server_clan_categories server_clans server_countdowns
server_custom_embeds server_logs server_roles server_welcome_panel_buttons server_welcome_panels
dashboard_role_grants roster_groups roster_members roster_views rosters
ticket_panel ticket_panel_buttons ticket_panel_staff_permissions ticket_panels tickets
reminders autoboards autoboard_targets bases giveaways strikes
war_archive_packs war_archive_pending wars`.split(/\s+/))
const local = new pg.Client({ connectionString: 'postgres://clashking_local:clashking_local@127.0.0.1:54329/clashking_dev' })
await local.connect()
try {
  if (process.argv[2] === 'export') {
    const metadata = JSON.parse(remote(`SELECT json_agg(x) FROM (SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) x;`))
    const tables = new Map()
    for (const row of metadata) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, [])
      tables.get(row.table_name).push(row)
    }
    const localTables = new Set((await local.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row => row.tablename))
    const manifest = []
    for (const [table, columns] of tables) {
      if (!allowed.has(table) || excluded.has(table) || !localTables.has(table)) continue
      let predicate = predicates[table]
      if (!predicate) {
        const options = []
        for (const { column_name: column } of columns) {
          if (column === 'server_id') options.push(`${quote(column)}::text IN ${servers}`)
          if (column === 'user_id') options.push(`${quote(column)}::text IN ${users}`)
          if (column === 'player_tag' || column === 'tag' && table.startsWith('player_')) options.push(`${quote(column)} IN (${linked})`)
          if (column === 'clan_tag' && !table.startsWith('player_') && !table.startsWith('leaderboard_history_player')) options.push(`${quote(column)} IN ${clans}`)
        }
        predicate = options.join(' OR ')
      }
      if (!predicate) continue
      if (columns.some(c => c.column_name === 'server_id')) predicate = `(${predicate}) AND server_id::text IN ${servers}`
      // Text encoding preserves BIGINT IDs, timestamps, arrays and JSON exactly.
      const fields = columns.map(({ column_name: column }) => `'${column}',${column === 'webhook_token' ? "NULL::text" : `${quote(column)}::text`}`).join(',')
      const path = resolve(destination, `${table}.jsonl`)
      let data
      try {
        data = existsSync(path) ? readFileSync(path, 'utf8') : remote(`SELECT json_build_object(${fields}) FROM public.${quote(table)} WHERE ${predicate};`)
      } catch {
        manifest.push({ table, error: 'source query timeout; retry separately', columns: columns.map(row => row.column_name) })
        console.log(JSON.stringify({ table, error: 'source query timeout; continuing other tables' }))
        continue
      }
      const count = data ? data.split('\n').length : 0
      writeFileSync(resolve(destination, `${table}.jsonl`), data, { mode: 0o600 })
      manifest.push({ table, count, columns: columns.map(row => row.column_name) })
      console.log(JSON.stringify({ table, count }))
    }
    writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  } else {
    console.log('Use export; merge is implemented after schema/conflict inspection.')
  }
} finally { await local.end() }
