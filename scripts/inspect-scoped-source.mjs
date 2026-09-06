import { execFileSync } from "node:child_process"
const remote = (sql) => execFileSync("ssh", ["root@152.53.82.182", "docker exec -i timescale-qsj8dfwekv4uw7ri76r9bhcx-044219017574 sh -c 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d clashking'"], { input: `BEGIN READ ONLY; SET LOCAL statement_timeout='60s';\n${sql}\nROLLBACK;`, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
console.log(remote(`
SELECT json_build_object('links', (SELECT json_agg(json_build_object('tag',tag,'user_id',user_id::text)) FROM player_links WHERE user_id::text IN ('706149153431879760','506210109790093342')),
 'servers', (SELECT json_agg(json_build_object('id',id::text,'name',name)) FROM servers WHERE id::text IN ('923764211845312533','684667214347108386')),
 'server_clans', (SELECT json_agg(tag) FROM server_clans WHERE server_id::text IN ('923764211845312533','684667214347108386')),
 'wars', (SELECT count(*) FROM wars WHERE clan_tag IN ('#2VC0Q9LV','#2GYQ8YY2V','#VY2J0LL') OR opponent_tag IN ('#2VC0Q9LV','#2GYQ8YY2V','#VY2J0LL')));
`))
