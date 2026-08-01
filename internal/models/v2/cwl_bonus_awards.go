package modelsv2

// CWLBonusMember is one member of the frozen clan roster for a CWL group.
type CWLBonusMember struct {
	Tag           string `json:"tag"`
	Name          string `json:"name"`
	TownHallLevel int    `json:"townHallLevel"`
}

type CWLBonusClan struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type CWLBonusLeague struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// CWLBonusSubmission is one immutable award-ledger revision.
type CWLBonusSubmission struct {
	ID               string   `json:"id"`
	Revision         int      `json:"revision"`
	RecipientTags    []string `json:"recipientTags"`
	ActorDiscordID   string   `json:"actorDiscordId"`
	CalculationMode  string   `json:"calculationMode" enums:"official,override"`
	OverrideReason   *string  `json:"overrideReason,omitempty"`
	CorrectionReason *string  `json:"correctionReason,omitempty"`
	CreatedAt        string   `json:"createdAt"`
}

type CWLBonusCalculation struct {
	Status         string   `json:"status" enums:"ready,incomplete"`
	AwardCount     *int     `json:"awardCount,omitempty"`
	BaseAwardCount *int     `json:"baseAwardCount,omitempty"`
	RulesetVersion string   `json:"rulesetVersion"`
	Reasons        []string `json:"reasons"`
}

type CWLBonusContext struct {
	CWLID             string              `json:"cwlId"`
	Clan              CWLBonusClan        `json:"clan"`
	Season            string              `json:"season"`
	League            CWLBonusLeague      `json:"league"`
	WarSize           int                 `json:"warSize"`
	FinalPlacement    *int                `json:"finalPlacement,omitempty"`
	WarsWon           int                 `json:"warsWon"`
	Calculation       CWLBonusCalculation `json:"calculation"`
	Members           []CWLBonusMember    `json:"members"`
	CurrentSubmission *CWLBonusSubmission `json:"currentSubmission,omitempty"`
}

// SubmitCWLBonusAwards requests an immutable first submission or correction.
// League, placement, wins, rules, member names, and the official award count
// are deliberately absent because the API recalculates them from stored facts.
type SubmitCWLBonusAwards struct {
	ServerID           string   `json:"serverId"`
	CWLID              string   `json:"cwlId"`
	RecipientTags      []string `json:"recipientTags"`
	ExpectedRevision   int      `json:"expectedRevision"`
	AwardCountOverride *int     `json:"awardCountOverride,omitempty"`
	OverrideReason     *string  `json:"overrideReason,omitempty"`
	CorrectionReason   *string  `json:"correctionReason,omitempty"`
}

type CWLBonusHistoryItem struct {
	CWLBonusSubmission
	Clan           CWLBonusClan     `json:"clan"`
	Season         string           `json:"season"`
	League         CWLBonusLeague   `json:"league"`
	WarSize        int              `json:"warSize"`
	FinalPlacement int              `json:"finalPlacement"`
	WarsWon        int              `json:"warsWon"`
	AwardCount     int              `json:"awardCount"`
	Superseded     bool             `json:"superseded"`
	Recipients     []CWLBonusMember `json:"recipients"`
}

type CWLBonusHistoryResponse struct {
	Items []CWLBonusHistoryItem `json:"items"`
}
