package modelsv2

import "time"

type BillingSessionResponse struct {
	URL string `json:"url"`
}

type BillingCheckoutRequest struct {
	ServerID string `json:"serverId"`
}

type BillingAssignmentRequest struct {
	ServerID *string `json:"serverId"`
}

type BillingSubscriptionResponse struct {
	Provider                        string  `json:"provider"`
	Status                          string  `json:"status"`
	Active                          bool    `json:"active"`
	CheckoutEnabled                 bool    `json:"checkoutEnabled"`
	BookmarkNotificationsLimit      int     `json:"bookmarkNotificationsLimit"`
	RosterAssistantMonthlyCreditUSD float64 `json:"rosterAssistantMonthlyCreditUsd"`
	AssignedServerID                *string `json:"assignedServerId"`
	RosterAssistantSpentUSD         float64 `json:"rosterAssistantSpentUsd"`
	RosterAssistantRemainingUSD     float64 `json:"rosterAssistantRemainingUsd"`
}

type BillingUsageResponse struct {
	ServerID                string    `json:"serverId"`
	ServerSpentUSD          float64   `json:"serverSpentUsd"`
	ServerLimitUSD          float64   `json:"serverLimitUsd"`
	UserSpentUSD            float64   `json:"userSpentUsd"`
	UserLimitUSD            float64   `json:"userLimitUsd"`
	GlobalFreeAvailable     bool      `json:"globalFreeAvailable"`
	SubscriptionActive      bool      `json:"subscriptionActive"`
	AssignedSubscriberCount int       `json:"assignedSubscriberCount"`
	PaidLimitUSD            float64   `json:"paidLimitUsd"`
	PaidSpentUSD            float64   `json:"paidSpentUsd"`
	PaidRemainingUSD        float64   `json:"paidRemainingUsd"`
	ResetsAt                time.Time `json:"resetsAt"`
}
