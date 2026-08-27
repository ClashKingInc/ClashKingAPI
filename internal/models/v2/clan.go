package modelsv2

import "time"

type ClanTagsBody struct {
	ClanTags []string `json:"clan_tags"`
}

type ClanBadgeURLs struct {
	Small  string `json:"small" swaggerignore:"true"`
	Medium string `json:"medium" swaggerignore:"true"`
	Large  string `json:"large"`
}

type ClanLeagueRef struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ClanRecordEntry struct {
	Value int       `json:"value"`
	Time  time.Time `json:"time"`
}

type ClanBasicRecords struct {
	ClanPoints   *ClanRecordEntry `json:"clanPoints,omitempty"`
	WarWinStreak *ClanRecordEntry `json:"warWinStreak,omitempty"`
}

type ClanCachedMember struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
}

// ClanCachedResponse is a potentially several-hours-old clan profile cached by ClashKing.
type ClanCachedResponse struct {
	Name           string             `json:"name"`
	Tag            string             `json:"tag"`
	BadgeURLs      ClanBadgeURLs      `json:"badgeUrls"`
	Description    string             `json:"description"`
	ClanLevel      int                `json:"clanLevel"`
	ClanPoints     int                `json:"clanPoints"`
	Location       *SearchLocation    `json:"location,omitempty"`
	WarLeague      ClanLeagueRef      `json:"warLeague"`
	CapitalLeague  *ClanLeagueRef     `json:"capitalLeague,omitempty"`
	PublicWarLog   bool               `json:"publicWarLog"`
	WarWins        int                `json:"warWins"`
	WarWinStreak   int                `json:"warWinStreak"`
	MemberCount    int                `json:"memberCount"`
	TroopsDonated  int                `json:"troopsDonated"`
	TroopsReceived int                `json:"troopsReceived"`
	LastActive     *time.Time         `json:"lastActive,omitempty"`
	Members        []ClanCachedMember `json:"members"`
}
