package modelsv2

type AutoBoardRefreshIntervalCapability struct {
	MinMinutes     int `json:"minMinutes"`
	MaxMinutes     int `json:"maxMinutes"`
	DefaultMinutes int `json:"defaultMinutes"`
}

type AutoBoardTypeCapability struct {
	BoardType       string                              `json:"boardType"`
	Label           string                              `json:"label"`
	TargetKind      string                              `json:"targetKind"`
	MinTargets      int                                 `json:"minTargets"`
	MaxTargets      int                                 `json:"maxTargets"`
	AllowedScopes   []string                            `json:"allowedScopes"`
	AllowedModes    []string                            `json:"allowedModes"`
	RefreshInterval *AutoBoardRefreshIntervalCapability `json:"refreshInterval"`
	UICapabilities  []string                            `json:"uiCapabilities"`
}

type AutoBoardCapabilitiesResponse struct {
	BoardTypes []AutoBoardTypeCapability `json:"boardTypes"`
}

type AutoBoardSchedule struct {
	Kind       string `json:"kind"`
	TimeOfDay  string `json:"timeOfDay"`
	Weekdays   []int  `json:"weekdays,omitempty"`
	DayOfMonth *int   `json:"dayOfMonth,omitempty"`
}

type AutoBoardConfig struct {
	ID              string             `json:"id"`
	BoardType       string             `json:"boardType"`
	TargetKind      string             `json:"targetKind"`
	TargetScope     string             `json:"targetScope"`
	Targets         []string           `json:"targets"`
	DeliveryMode    string             `json:"deliveryMode"`
	ChannelID       *string            `json:"channelId"`
	ChannelDeleted  bool               `json:"channelDeleted"`
	ThreadID        *string            `json:"threadId"`
	MessageID       *string            `json:"messageId"`
	Enabled         bool               `json:"enabled"`
	IntervalMinutes *int               `json:"intervalMinutes"`
	Schedule        *AutoBoardSchedule `json:"schedule"`
	NextRunAt       *string            `json:"nextRunAt"`
	LastRunAt       *string            `json:"lastRunAt"`
	CreatedAt       string             `json:"createdAt"`
	UpdatedAt       string             `json:"updatedAt"`
}

type ServerAutoBoardsResponse struct {
	Items        []AutoBoardConfig `json:"items"`
	Total        int               `json:"total"`
	RefreshCount int               `json:"refreshCount"`
	SendCount    int               `json:"sendCount"`
	Limit        int               `json:"limit"`
}

type AutoBoardWriteRequest struct {
	BoardType       string             `json:"boardType"`
	TargetScope     string             `json:"targetScope"`
	Targets         []string           `json:"targets"`
	DeliveryMode    string             `json:"deliveryMode"`
	ChannelID       string             `json:"channelId"`
	ThreadID        *string            `json:"threadId"`
	Enabled         bool               `json:"enabled"`
	IntervalMinutes *int               `json:"intervalMinutes"`
	Schedule        *AutoBoardSchedule `json:"schedule"`
}

type CreateAutoBoardRequest = AutoBoardWriteRequest
type ReplaceAutoBoardRequest = AutoBoardWriteRequest

type AutoBoardItemResponse struct {
	Item AutoBoardConfig `json:"item"`
}

type AutoBoardDeleteResponse struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}
