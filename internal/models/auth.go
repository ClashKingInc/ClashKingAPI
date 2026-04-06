package models

type AuthUserInfo struct {
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
}

type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         AuthUserInfo `json:"user"`
}

type AuthRefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
	DeviceID     string `json:"device_id"`
}

type AuthEmailAuthRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
}

type AuthEmailRegisterRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	Username   string `json:"username"`
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
}

type AuthForgotPasswordRequest struct {
	Email string `json:"email"`
}

type AuthResetPasswordRequest struct {
	Email       string `json:"email"`
	ResetCode   string `json:"reset_code"`
	NewPassword string `json:"new_password"`
	DeviceID    string `json:"device_id"`
	DeviceName  string `json:"device_name"`
}

type AuthEmailCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type AuthDiscordOAuthRequest struct {
	Code         string `json:"code"`
	CodeVerifier string `json:"code_verifier"`
	DeviceID     string `json:"device_id"`
	DeviceName   string `json:"device_name"`
	RedirectURI  string `json:"redirect_uri"`
}
