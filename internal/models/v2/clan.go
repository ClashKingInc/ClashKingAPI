package modelsv2

import "time"

type ClanPlayerTagsBody struct {
	PlayerTags []string `json:"player_tags"`
}

type ClanTagsBody struct {
	ClanTags []string `json:"clan_tags"`
}

type ClanBadgeURLs struct {
	Small  string `json:"small" swaggerignore:"true"`
	Medium string `json:"medium" swaggerignore:"true"`
	Large  string `json:"large"`
}

type ClanLeagueRef struct {
	ID int32 `json:"id"`
}

type ClanRecordEntry struct {
	Value int       `json:"value"`
	Time  time.Time `json:"time"`
}

type ClanBasicRecords struct {
	ClanPoints   *ClanRecordEntry `json:"clanPoints,omitempty"`
	WarWinStreak *ClanRecordEntry `json:"warWinStreak,omitempty"`
}

// ClanBasicResponse is returned by the basic clan endpoints.
type ClanBasicResponse struct {
	Name           string            `json:"name"`
	Tag            string            `json:"tag"`
	BadgeURLs      ClanBadgeURLs     `json:"badgeUrls"`
	Description    string            `json:"description"`
	ClanLevel      int               `json:"clanLevel"`
	ClanPoints     int               `json:"clanPoints"`
	Location       *ClanLeagueRef    `json:"location,omitempty"`
	WarLeague      ClanLeagueRef     `json:"warLeague"`
	CapitalLeague  *ClanLeagueRef    `json:"capitalLeague,omitempty"`
	PublicWarLog   bool              `json:"publicWarLog"`
	WarWins        int               `json:"warWins"`
	WarWinStreak   int               `json:"warWinStreak"`
	MemberCount    int               `json:"memberCount"`
	TroopsDonated  int               `json:"troopsDonated"`
	TroopsReceived int               `json:"troopsReceived"`
	LastActive     *time.Time        `json:"lastActive,omitempty"`
	Records        *ClanBasicRecords `json:"records,omitempty"`
	Members        any               `json:"members"`
}
