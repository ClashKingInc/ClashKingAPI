package modelsv2

type CWLBonusRecipient struct {
	PlayerTag  string `json:"playerTag"`
	MedalCount int    `json:"medalCount"`
}

type CWLBonusRecipientsResponse struct {
	Items []CWLBonusRecipient `json:"items"`
}

type ReplaceCWLBonusRecipientsRequest struct {
	Recipients []CWLBonusRecipient `json:"recipients"`
}
