package modelsv2

type BotClusterInfo struct {
	ClusterID   int      `json:"cluster_id"`
	Shards      []int    `json:"shards"`
	ShardIDs    []int    `json:"shard_ids"`
	ServerCount int      `json:"server_count"`
	MemberCount int      `json:"member_count"`
	ClanCount   int      `json:"clan_count"`
	Servers     []string `json:"servers"`
}

type BotRuntimeInfo struct {
	TotalServers int64            `json:"total_servers"`
	TotalMembers int64            `json:"total_members"`
	TotalClans   int64            `json:"total_clans"`
	TotalShards  int              `json:"total_shards"`
	Clusters     []BotClusterInfo `json:"clusters"`
}

type SystemRuntimeInfo struct {
	PythonVersion    string  `json:"python_version"`
	GoVersion        string  `json:"go_version"`
	Platform         string  `json:"platform"`
	CPUPercent       float64 `json:"cpu_percent"`
	MemoryUsedMB     float64 `json:"memory_used_mb"`
	MemoryTotalGB    float64 `json:"memory_total_gb"`
	MemoryPercent    float64 `json:"memory_percent"`
	DiskUsagePercent float64 `json:"disk_usage_percent"`
}

type DatabaseRuntimeInfo struct {
	ClansTracked   int64 `json:"clans_tracked"`
	PlayersTracked int64 `json:"players_tracked"`
	WarsStored     int64 `json:"wars_stored"`
	TicketsOpen    int64 `json:"tickets_open"`
	CapitalRaids   int64 `json:"capital_raids"`
}

type BotInfoResponse struct {
	Bot      BotRuntimeInfo      `json:"bot"`
	System   SystemRuntimeInfo   `json:"system"`
	Database DatabaseRuntimeInfo `json:"database"`
}
