package utils

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Databases struct {
	ClashKing      *mongo.Database
	Settings       *mongo.Database
	Auth           *mongo.Database
	NewLooper      *mongo.Database
	Cache          *mongo.Database
	Looper         *mongo.Database
	RankingHistory *mongo.Database
	Usafam         *mongo.Database
	Bot            *mongo.Database
}

type Collections struct {
	Tokens           *mongo.Collection
	Users            *mongo.Collection
	BotSync          *mongo.Collection
	ClanDB           *mongo.Collection
	PlayerStats      *mongo.Collection
	ClanWars         *mongo.Collection
	Banlist          *mongo.Collection
	RaidWeekendDB    *mongo.Collection
	DiscordTokens    *mongo.Collection
	RefreshTokens    *mongo.Collection
	EmailVerify      *mongo.Collection
	PasswordResets   *mongo.Collection
	COCAccounts      *mongo.Collection
	Rosters          *mongo.Collection
	RosterGroups     *mongo.Collection
	SignupCats       *mongo.Collection
	RosterAutomation *mongo.Collection
	ServerDB         *mongo.Collection
	Clans            *mongo.Collection
	Reminders        *mongo.Collection
	Autoboards       *mongo.Collection
	Links            *mongo.Collection
	StrikeList       *mongo.Collection
	Groups           *mongo.Collection
	UserSettings     *mongo.Collection
	BasicClan        *mongo.Collection
	Giveaways        *mongo.Collection
	LeaderboardDB    *mongo.Collection
	ClanLeaderboardDB *mongo.Collection
	ClanStats        *mongo.Collection
}

type Store struct {
	statsClient  *mongo.Client
	staticClient *mongo.Client
	DB           Databases
	C            Collections
}

func NewStore(ctx context.Context, cfg Config) (*Store, error) {
	statsClient, err := mongo.Connect(options.Client().ApplyURI(cfg.StatsMongoURI))
	if err != nil {
		return nil, err
	}
	staticClient, err := mongo.Connect(options.Client().ApplyURI(cfg.StaticMongoURI))
	if err != nil {
		_ = statsClient.Disconnect(ctx)
		return nil, err
	}

	db := Databases{
		ClashKing:      statsClient.Database("clashking"),
		Settings:       statsClient.Database("settings"),
		Auth:           statsClient.Database("auth"),
		NewLooper:      statsClient.Database("new_looper"),
		Cache:          statsClient.Database("cache"),
		Looper:         statsClient.Database("looper"),
		RankingHistory: statsClient.Database("ranking_history"),
		Usafam:         staticClient.Database("usafam"),
		Bot:            staticClient.Database("bot"),
	}

	return &Store{
		statsClient:  statsClient,
		staticClient: staticClient,
		DB:           db,
		C: Collections{
			Tokens:           db.ClashKing.Collection("tokens"),
			Users:            db.Auth.Collection("users"),
			BotSync:          db.ClashKing.Collection("bot_sync"),
			ClanDB:           db.Usafam.Collection("clans"),
			PlayerStats:      db.NewLooper.Collection("player_stats"),
			ClanWars:         db.Looper.Collection("clan_war"),
			Banlist:          db.Usafam.Collection("banlist"),
			RaidWeekendDB:    db.Looper.Collection("raid_weekends"),
			DiscordTokens:    db.Auth.Collection("discord_tokens"),
			RefreshTokens:    db.Auth.Collection("refresh_tokens"),
			EmailVerify:      db.Auth.Collection("email_verifications"),
			PasswordResets:   db.Auth.Collection("password_reset_tokens"),
			COCAccounts:      db.ClashKing.Collection("coc_accounts"),
			Rosters:          db.ClashKing.Collection("rosters"),
			RosterGroups:     db.ClashKing.Collection("roster_groups"),
			SignupCats:       db.ClashKing.Collection("roster_signup_categories"),
			RosterAutomation: db.ClashKing.Collection("roster_automation"),
			ServerDB:         db.Usafam.Collection("server"),
			Clans:            db.Settings.Collection("clans"),
			Reminders:        db.Usafam.Collection("reminders"),
			Autoboards:       db.ClashKing.Collection("autoboards"),
			Links:            db.ClashKing.Collection("coc_accounts"),
			StrikeList:       db.Usafam.Collection("strikes"),
			Groups:           db.ClashKing.Collection("groups"),
			UserSettings:     db.Usafam.Collection("user_settings"),
			BasicClan:        db.Looper.Collection("clan_tags"),
			Giveaways:        db.ClashKing.Collection("giveaways"),
			LeaderboardDB:    db.NewLooper.Collection("leaderboard_db"),
			ClanLeaderboardDB: db.NewLooper.Collection("clan_leaderboard_db"),
			ClanStats:        db.NewLooper.Collection("clan_stats"),
		},
	}, nil
}

func (s *Store) Close(ctx context.Context) error {
	if err := s.statsClient.Disconnect(ctx); err != nil {
		return err
	}
	return s.staticClient.Disconnect(ctx)
}
