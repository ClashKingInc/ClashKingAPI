package modelsv2

import "time"

type RosterMetric struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	ValueType   string   `json:"valueType" enums:"string,number,boolean,json,time"`
	Kind        string   `json:"kind" enums:"snapshot,historical,derived,presentation"`
	Description string   `json:"description"`
	CacheTTL    int      `json:"cacheTtlSeconds"`
	DependsOn   []string `json:"dependsOn,omitempty"`
}

type RosterViewColumn struct {
	ID          string         `json:"id"`
	Label       string         `json:"label"`
	MetricID    string         `json:"metricId"`
	Description *string        `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
	Format      *string        `json:"format,omitempty"`
}

type RosterViewSort struct {
	ColumnID  string `json:"columnId"`
	Direction string `json:"direction" enums:"asc,desc"`
}

type RosterViewFilter struct {
	ColumnID string `json:"columnId"`
	Operator string `json:"operator" enums:"eq,neq,gt,gte,lt,lte,in,contains"`
	Value    any    `json:"value"`
}

type RosterViewHighlightCondition struct {
	ColumnID string `json:"columnId,omitempty"`
	Operator string `json:"operator" enums:"eq,neq,gt,gte,lt,lte,in,contains"`
	Value    any    `json:"value"`
}

type RosterViewHighlight struct {
	ID       string                        `json:"id"`
	Target   string                        `json:"target" enums:"row,column,cell"`
	ColumnID string                        `json:"columnId,omitempty"`
	When     *RosterViewHighlightCondition `json:"when,omitempty"`
	Tone     string                        `json:"tone" enums:"red,amber,green,blue,purple,gray"`
}

type RosterViewSpec struct {
	SchemaVersion int                   `json:"schemaVersion" enums:"1"`
	Columns       []RosterViewColumn    `json:"columns"`
	Sort          []RosterViewSort      `json:"sort,omitempty"`
	Filters       []RosterViewFilter    `json:"filters,omitempty"`
	Highlights    []RosterViewHighlight `json:"highlights,omitempty"`
	Limit         *int                  `json:"limit,omitempty"`
}

type RosterViewWrite struct {
	Name          string `json:"name"`
	SourceCode    string `json:"sourceCode"`
	SourceVersion int    `json:"sourceVersion"`
}

type RosterViewUpdate struct {
	Name          string `json:"name"`
	SourceCode    string `json:"sourceCode"`
	SourceVersion int    `json:"sourceVersion"`
}

type RosterMetricQueryRequest struct {
	RosterIDs  []string       `json:"rosterIds"`
	MetricID   string         `json:"metricId"`
	Parameters map[string]any `json:"parameters,omitempty"`
	Force      bool           `json:"force"`
}

type RosterView struct {
	ID            string          `json:"id"`
	ShareID       string          `json:"shareId"`
	ServerID      string          `json:"serverId"`
	Name          string          `json:"name"`
	SourceCode    string          `json:"sourceCode"`
	SourceVersion int             `json:"sourceVersion"`
	CreatedBy     string          `json:"createdBy"`
	Spec          *RosterViewSpec `json:"spec,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

type RosterQuestion struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Type     string   `json:"type" enums:"text,boolean,single_select"`
	Required bool     `json:"required"`
	Options  []string `json:"options"`
	Order    int      `json:"order"`
}

type RosterQuestionnaireWrite struct {
	Questions []RosterQuestion `json:"questions"`
}

type RosterAccountSelector struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
}

type RosterQuestionnaire struct {
	AccountSelector RosterAccountSelector `json:"accountSelector"`
	Questions       []RosterQuestion      `json:"questions"`
}

type RosterQuestionnaireMutationResponse struct {
	Questionnaire       RosterQuestionnaire `json:"questionnaire"`
	AffectedMemberCount int64               `json:"affectedMemberCount"`
}

type RosterAIMessage struct {
	ID      string                `json:"id,omitempty"`
	Role    string                `json:"role" enums:"user,assistant"`
	Content string                `json:"content,omitempty"`
	Parts   []RosterAIMessagePart `json:"parts,omitempty"`
}

type RosterAIMessagePart struct {
	Type       string                `json:"type"`
	Text       string                `json:"text,omitempty"`
	ToolCallID string                `json:"toolCallId,omitempty"`
	State      string                `json:"state,omitempty"`
	Input      any                   `json:"input,omitempty"`
	Approval   *RosterAIToolApproval `json:"approval,omitempty"`
}

type RosterAIToolApproval struct {
	ID       string `json:"id"`
	Approved *bool  `json:"approved,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

type RosterAIRequest struct {
	ServerID  string            `json:"serverId,omitempty"`
	RosterIDs []string          `json:"rosterIds,omitempty"`
	ViewID    string            `json:"viewId,omitempty"`
	Messages  []RosterAIMessage `json:"messages"`
}

type RosterMembershipChange struct {
	Action       string `json:"action" enums:"add,remove,move"`
	PlayerTag    string `json:"playerTag"`
	FromRosterID string `json:"fromRosterId,omitempty"`
	ToRosterID   string `json:"toRosterId,omitempty"`
	Reason       string `json:"reason,omitempty"`
}

type RosterMembershipApplyRequest struct {
	ServerID          string                   `json:"serverId"`
	Changes           []RosterMembershipChange `json:"changes"`
	ExpectedRevisions map[string]int64         `json:"expectedRevisions"`
}

type RosterRefreshRequest struct {
	Scope string `json:"scope" enums:"data,role"`
}

type RosterDiscordIdentityRefreshRequest struct {
	PlayerTag string `json:"playerTag"`
}

type RosterSignupSubmissionRequest struct {
	PlayerTag        string         `json:"playerTag"`
	Answers          map[string]any `json:"answers"`
	DiscordUserID    string         `json:"discordUserId,omitempty"`
	DiscordUsername  string         `json:"discordUsername,omitempty"`
	DiscordAvatarURL string         `json:"discordAvatarUrl,omitempty"`
}

type RosterSignupSubmission struct {
	ID        string         `json:"id"`
	RosterID  string         `json:"rosterId"`
	PlayerTag string         `json:"playerTag"`
	Answers   map[string]any `json:"answers"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

type RosterRefreshResponseV2 struct {
	RefreshID         string    `json:"refreshId"`
	Scope             string    `json:"scope"`
	Status            string    `json:"status"`
	RefreshedPlayers  int       `json:"refreshedPlayers"`
	FailedPlayers     int       `json:"failedPlayers"`
	RefreshedAt       time.Time `json:"refreshedAt"`
	Reused            bool      `json:"reused"`
	RoleID            *string   `json:"roleId,omitempty"`
	RoleMemberUserIDs []string  `json:"roleMemberUserIds,omitempty"`
}

type PublicRosterMember struct {
	PlayerTag       string  `json:"playerTag"`
	Name            string  `json:"name"`
	Townhall        int     `json:"townhall"`
	CurrentClanName *string `json:"currentClanName,omitempty"`
	CurrentClanTag  *string `json:"currentClanTag,omitempty"`
}

type PublicRosterViewerResponse struct {
	ID           string               `json:"id"`
	Name         string               `json:"name"`
	Description  *string              `json:"description,omitempty"`
	ClanName     *string              `json:"clanName,omitempty"`
	ClanTag      *string              `json:"clanTag,omitempty"`
	ClanBadgeURL *string              `json:"clanBadgeUrl,omitempty"`
	UpdatedAt    time.Time            `json:"updatedAt"`
	Members      []PublicRosterMember `json:"members"`
}
