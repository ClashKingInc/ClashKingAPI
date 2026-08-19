package modelsv2

type SearchIntegerRange struct {
	Min *int `json:"min,omitempty" minimum:"0"`
	Max *int `json:"max,omitempty" minimum:"0"`
}

type SearchClanFilters struct {
	LocationIDs  []int               `json:"location_ids,omitempty" validate:"max=5"`
	CWLLeagueIDs []int               `json:"cwl_league_ids,omitempty" validate:"max=5"`
	ClanLevel    *SearchIntegerRange `json:"clan_level,omitempty"`
	Members      *SearchIntegerRange `json:"members,omitempty"`
}

type SearchPlayerFilters struct {
	ClanTags       []string `json:"clan_tags,omitempty" validate:"max=100"`
	LeagueIDs      []int    `json:"league_ids,omitempty" validate:"max=5"`
	TownhallLevels []int    `json:"townhall_levels,omitempty" validate:"max=100"`
}

type SearchClanQuery struct {
	Query   string            `json:"query" binding:"required" minLength:"2" maxLength:"100"`
	Filters SearchClanFilters `json:"filters"`
	Limit   int               `json:"limit,omitempty" minimum:"1" maximum:"200" default:"25"`
	Cursor  string            `json:"cursor,omitempty"`
}

type SearchPlayerQuery struct {
	Query   string              `json:"query" binding:"required" minLength:"2" maxLength:"100"`
	Filters SearchPlayerFilters `json:"filters"`
	Limit   int                 `json:"limit,omitempty" minimum:"1" maximum:"200" default:"25"`
	Cursor  string              `json:"cursor,omitempty"`
}

type SearchLocation struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	IsCountry     bool   `json:"isCountry"`
	CountryCode   string `json:"countryCode,omitempty"`
	LocalizedName string `json:"localizedName,omitempty"`
}

type SearchLeagueReference struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type SearchClanResult struct {
	Name      string                 `json:"name"`
	Tag       string                 `json:"tag"`
	Badge     string                 `json:"badge,omitempty"`
	ClanLevel int                    `json:"clanLevel"`
	Location  *SearchLocation        `json:"location,omitempty"`
	WarLeague *SearchLeagueReference `json:"warLeague,omitempty"`
	Members   int                    `json:"members"`
}

type SearchPlayerClan struct {
	Name      string `json:"name,omitempty"`
	Tag       string `json:"tag"`
	Badge     string `json:"badge,omitempty"`
	ClanLevel int    `json:"clanLevel,omitempty"`
}

type SearchPlayerResult struct {
	Name          string                 `json:"name"`
	Tag           string                 `json:"tag"`
	TownHallLevel int                    `json:"townHallLevel"`
	LeagueTier    *SearchLeagueReference `json:"leagueTier,omitempty"`
	Clan          *SearchPlayerClan      `json:"clan,omitempty"`
}

type SearchCursorPage struct {
	Limit      int     `json:"limit"`
	HasMore    bool    `json:"has_more"`
	NextCursor *string `json:"next_cursor"`
}

type SearchClanResponse struct {
	Items      []SearchClanResult `json:"items"`
	Pagination SearchCursorPage   `json:"pagination"`
}

type SearchPlayerResponse struct {
	Items      []SearchPlayerResult `json:"items"`
	Pagination SearchCursorPage     `json:"pagination"`
}

type SearchPlayerReference struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type SearchPlayerReferenceResponse struct {
	Items []SearchPlayerReference `json:"items"`
}

type SuccessResponse struct {
	Success bool `json:"success"`
}
