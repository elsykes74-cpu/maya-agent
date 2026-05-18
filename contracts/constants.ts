export const Session = {
	cookieName: "kimi_sid",
	maxAgeMs: 365 * 24 * 60 * 60 * 1000,
};

export const Paths = {
	login: "/login",
	oauthCallback: "/api/oauth/callback",
};

export const ErrorMessages = {
	unauthenticated: "Authentication required",
	insufficientRole: "Insufficient permissions",
};
