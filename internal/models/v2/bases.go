package modelsv2

import "time"

type Base struct {
	ID                string    `json:"id"`
	ServerID          string    `json:"serverId"`
	ChannelID         string    `json:"channelId"`
	MessageID         string    `json:"messageId"`
	BaseLink          string    `json:"baseLink"`
	Images            []string  `json:"images"`
	Description       string    `json:"description"`
	DownloadCount     int       `json:"downloadCount"`
	Upvotes           int       `json:"upvotes"`
	Downvotes         int       `json:"downvotes"`
	Downloaders       []string  `json:"downloaders"`
	CreatedAt         time.Time `json:"createdAt"`
	DiscordMessageURL string    `json:"discordMessageUrl"`
}

type BasesResponse struct {
	Items  []Base `json:"items"`
	Total  int    `json:"total"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

type CreateBaseRequest struct {
	ChannelID   string   `json:"channelId"`
	BaseLink    string   `json:"baseLink"`
	Images      []string `json:"images"`
	Description string   `json:"description"`
}

type BaseDownloaderProfile struct {
	UserID      string  `json:"userId"`
	DisplayName *string `json:"displayName"`
	AvatarURL   *string `json:"avatarUrl"`
}

type BaseVoteRequest struct {
	Direction string `json:"direction" enums:"up,down"`
}

type BaseVoteResponse struct {
	BaseID    string `json:"baseId"`
	VoterID   string `json:"voterId"`
	Direction string `json:"direction"`
}

type BaseDownloadResponse struct {
	BaseID        string `json:"baseId"`
	UserID        string `json:"userId"`
	DownloadCount int    `json:"downloadCount"`
}

type BaseDeleteResponse struct {
	BaseID                string `json:"baseId"`
	DatabaseDeleted       bool   `json:"databaseDeleted"`
	DiscordMessageCleanup string `json:"discordMessageCleanup" enums:"deleted,alreadyMissing"`
}

type BaseDeleteErrorResponse struct {
	Code                  ErrorCode `json:"code"`
	Message               string    `json:"message"`
	RequestID             string    `json:"requestId,omitempty"`
	BaseID                string    `json:"baseId"`
	DatabaseDeleted       bool      `json:"databaseDeleted"`
	DiscordMessageCleanup string    `json:"discordMessageCleanup" enums:"deleted,alreadyMissing,failed"`
	Retryable             bool      `json:"retryable"`
}

type BaseCreateErrorResponse struct {
	Code                  ErrorCode `json:"code"`
	Message               string    `json:"message"`
	RequestID             string    `json:"requestId,omitempty"`
	DatabaseInserted      bool      `json:"databaseInserted"`
	DiscordMessageCreated bool      `json:"discordMessageCreated"`
	DiscordMessageID      *string   `json:"discordMessageId,omitempty"`
	DiscordMessageCleanup string    `json:"discordMessageCleanup" enums:"notNeeded,deleted,alreadyMissing,failed"`
	Retryable             bool      `json:"retryable"`
}
