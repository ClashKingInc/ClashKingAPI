package server

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	disgorest "github.com/disgoorg/disgo/rest"
	"github.com/gofiber/fiber/v2"
)

func parseDiscordDestinationID(value string, field string) (int64, error) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed <= 0 {
		return 0, discordDestinationError(field, "must be a valid Discord snowflake")
	}
	return parsed, nil
}

func parseOptionalDiscordDestinationID(value *string, field string) (*int64, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	parsed, err := parseDiscordDestinationID(*value, field)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func validateDiscordDestination(
	c *fiber.Ctx,
	rt apptypes.Deps,
	serverID int,
	parentID int64,
	threadID *int64,
) error {
	if rt.Discord == nil {
		return apptypes.Error(http.StatusBadGateway, "Discord is unavailable")
	}
	parent, err := rt.Discord.GetChannel(c.UserContext(), parentID)
	if err != nil {
		return discordDestinationLookupError(err, "channel_id", "Discord channel was not found", "Failed to fetch Discord parent channel")
	}

	var thread discord.Channel
	if threadID != nil {
		thread, err = rt.Discord.GetChannel(c.UserContext(), *threadID)
		if err != nil {
			return discordDestinationLookupError(err, "thread_id", "Discord thread was not found", "Failed to fetch Discord thread")
		}
	}
	return validateDiscordDestinationChannels(serverID, parent, thread)
}

func validateDiscordDestinationChannels(serverID int, parent, thread discord.Channel) error {
	parentGuild, ok := parent.(discord.GuildChannel)
	if !ok || parentGuild.GuildID().String() != strconv.Itoa(serverID) {
		return discordDestinationError("channel_id", "must belong to the requested server")
	}
	switch parent.Type() {
	case discord.ChannelTypeGuildText, discord.ChannelTypeGuildNews, discord.ChannelTypeGuildForum:
	default:
		return discordDestinationError("channel_id", "must be a text, announcement, or forum channel")
	}

	if thread == nil {
		if parent.Type() == discord.ChannelTypeGuildForum {
			return discordDestinationError("thread_id", "is required when channel_id is a forum channel")
		}
		return nil
	}

	guildThread, ok := thread.(discord.GuildThread)
	if !ok {
		if threadPtr, pointerOK := thread.(*discord.GuildThread); pointerOK && threadPtr != nil {
			guildThread = *threadPtr
			ok = true
		}
	}
	if !ok {
		return discordDestinationError("thread_id", "must identify a Discord thread or forum post")
	}
	if guildThread.GuildID().String() != strconv.Itoa(serverID) {
		return discordDestinationError("thread_id", "must belong to the requested server")
	}
	if guildThread.ParentID() == nil || guildThread.ParentID().String() != parent.ID().String() {
		return discordDestinationError("thread_id", "must belong to channel_id")
	}
	return nil
}

func discordDestinationLookupError(err error, field, missingMessage, upstreamMessage string) error {
	var discordErr *disgorest.Error
	if errors.As(err, &discordErr) && discordErr.Response != nil && discordErr.Response.StatusCode == http.StatusNotFound {
		return discordDestinationError(field, missingMessage)
	}
	return apptypes.Error(http.StatusBadGateway, upstreamMessage)
}

func discordDestinationError(field, message string) error {
	return &apptypes.AppError{
		Status: http.StatusBadRequest,
		Code:   modelsv2.ErrorCodeValidationFailed,
		Detail: "Invalid Discord destination",
		Details: []modelsv2.FieldError{{
			Field:   field,
			Message: message,
		}},
	}
}
