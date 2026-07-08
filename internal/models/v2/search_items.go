package modelsv2

import "time"

type SearchBookmarkRequest struct {
	Type      string `json:"type" enums:"player,clan"`
	Tag       string `json:"tag,omitempty"`
	PlayerTag string `json:"player_tag,omitempty"`
	ClanTag   string `json:"clan_tag,omitempty"`
}

type SearchBookmarkOrderRequest struct {
	Type        string   `json:"type" enums:"player,clan"`
	OrderedTags []string `json:"ordered_tags"`
}

type SearchBookmarkItem struct {
	Type       string    `json:"type" enums:"player,clan"`
	Tag        string    `json:"tag"`
	PlayerTag  string    `json:"player_tag,omitempty"`
	ClanTag    string    `json:"clan_tag,omitempty"`
	OrderIndex int       `json:"order_index"`
	CreatedAt  time.Time `json:"created_at"`
}

type SearchBookmarkListResponse struct {
	Items []SearchBookmarkItem `json:"items"`
}

type SearchRecentBadgeURLs struct {
	Large string `json:"large,omitempty"`
}

type SearchRecentLeagueIconURLs struct {
	Medium string `json:"medium,omitempty"`
}

type SearchRecentClan struct {
	Tag       string                 `json:"tag,omitempty"`
	Name      string                 `json:"name,omitempty"`
	BadgeURLs *SearchRecentBadgeURLs `json:"badgeUrls,omitempty"`
}

type SearchRecentLeague struct {
	ID       int                         `json:"id,omitempty"`
	Name     string                      `json:"name,omitempty"`
	IconURLs *SearchRecentLeagueIconURLs `json:"iconUrls,omitempty"`
}

type SearchRecentPlayerItem struct {
	Name          string              `json:"name,omitempty"`
	Tag           string              `json:"tag"`
	TownHallLevel int                 `json:"townHallLevel,omitempty"`
	Clan          *SearchRecentClan   `json:"clan,omitempty"`
	League        *SearchRecentLeague `json:"league,omitempty"`
	CreatedAt     time.Time           `json:"created_at"`
}

type SearchRecentClanItem struct {
	Name      string                 `json:"name,omitempty"`
	Tag       string                 `json:"tag"`
	BadgeURLs *SearchRecentBadgeURLs `json:"badgeUrls,omitempty"`
	Members   int                    `json:"members,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
}

type SearchRecentGroupedResponse struct {
	Players []SearchRecentPlayerItem `json:"players"`
	Clans   []SearchRecentClanItem   `json:"clans"`
}
