package modelsv1

// CWLRankingRounds holds the win/tie/loss counts for a clan in a CWL season.
type CWLRankingRounds struct {
	Won  int `json:"won"`
	Tied int `json:"tied"`
	Lost int `json:"lost"`
}

// CWLRankingEntry is one clan row in the CWL season rankings computed by GET /cwl/:clan_tag/:season.
type CWLRankingEntry struct {
	Name        string           `json:"name"`
	Tag         string           `json:"tag"`
	Stars       int64            `json:"stars"`
	Destruction float64          `json:"destruction"`
	Rounds      CWLRankingRounds `json:"rounds"`
}
