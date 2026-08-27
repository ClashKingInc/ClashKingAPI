package modelsv2

type PlayerTimerType string

const (
	PlayerTimerTypeWar     PlayerTimerType = "war"
	PlayerTimerTypeCWL     PlayerTimerType = "cwl"
	PlayerTimerTypeCapital PlayerTimerType = "capital"
)

type PlayerTimer struct {
	Type      PlayerTimerType `json:"type" enums:"war,cwl,capital"`
	ExpiresAt string          `json:"expiresAt"`
	WarTag    string          `json:"warTag,omitempty"`
	Clans     []string        `json:"clans"`
}

type PlayerTimersResponse struct {
	Items []PlayerTimer `json:"items"`
}
