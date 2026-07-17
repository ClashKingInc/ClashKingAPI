package modelsv2

import "time"

type Announcement struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Subtitle       string     `json:"subtitle"`
	Body           string     `json:"body,omitempty"`
	Status         string     `json:"status" enums:"draft,scheduled,published,archived"`
	Target         string     `json:"target" enums:"all,ios,android"`
	BannerImageURL string     `json:"banner_image_url,omitempty"`
	HTMLObjectKey  string     `json:"html_object_key,omitempty"`
	HTMLURL        string     `json:"html_url,omitempty"`
	StartsAt       time.Time  `json:"starts_at"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	MinAppVersion  string     `json:"min_app_version,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AnnouncementListResponse struct {
	Items []Announcement `json:"items"`
}

type ActiveAnnouncementResponse struct {
	Item *Announcement `json:"item"`
}

type AnnouncementRequest struct {
	Title          string     `json:"title"`
	Subtitle       string     `json:"subtitle"`
	Body           string     `json:"body,omitempty"`
	Status         string     `json:"status,omitempty" enums:"draft,scheduled,published,archived"`
	Target         string     `json:"target,omitempty" enums:"all,ios,android"`
	BannerImageURL string     `json:"banner_image_url,omitempty"`
	HTMLObjectKey  string     `json:"html_object_key,omitempty"`
	HTMLURL        string     `json:"html_url,omitempty"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	MinAppVersion  string     `json:"min_app_version,omitempty"`
}
