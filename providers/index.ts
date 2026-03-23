import type { JWTPayload } from "jose";
import type { ProviderType } from "../";

type UserInfoBase<Provider extends ProviderType, Info = {}> = {
	provider: Provider;
} & Info;

export type PasswordUserInfo<Info = {}> = UserInfoBase<
	"password",
	{
		email: string;
	} & Info
>;

export type OIDCUserInfo<Info = {}> = UserInfoBase<"oidc", JWTPayload & Info>;

export type CodeUserInfo<Info = {}> = UserInfoBase<
	"code",
	{
		email?: string;
		phone?: string;
	} & Info
>;

export type AppleOAuthUserInfo<Info = {}> = UserInfoBase<
	"apple",
	Record<string, unknown> & Info
>;
export type AppleOIDCUserInfo<Info = {}> = UserInfoBase<
	"apple",
	JWTPayload & Info
>;

export type XUserInfo<Info = {}> = UserInfoBase<
	"x",
	{
		id: string;
		name: string;
		username: string;
		profile_image_url?: string;
	} & Info
>;

export type SlackUserInfo<Info = {}> = UserInfoBase<
	"slack",
	{
		sub: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		picture?: string;
		given_name?: string;
		family_name?: string;
		locale?: string;
	} & Info
>;

export type CognitoUserInfo<Info = {}> = UserInfoBase<
	"cognito",
	{
		sub: string;
		email?: string;
		email_verified?: string;
		username?: string;
		name?: string;
	} & Info
>;

export type DiscordUserInfo<Info = {}> = UserInfoBase<
	"discord",
	{
		id: string;
		username: string;
		discriminator: string;
		avatar?: string;
		bot?: boolean;
		system?: boolean;
		mfa_enabled?: boolean;
		locale?: string;
		verified?: boolean;
		email?: string;
		flags?: number;
		premium_type?: number;
		public_flags?: number;
	} & Info
>;

export type FacebookUserInfo<Info = {}> = UserInfoBase<
	"facebook",
	{
		id: string;
		name?: string;
		email?: string;
		picture?: {
			data: {
				url: string;
				width: number;
				height: number;
			};
		};
	} & Info
>;

export type GitHubUserInfo<Info = {}> = UserInfoBase<
	"github",
	{
		id: number;
		login: string;
		name?: string;
		email?: string;
		avatar_url?: string;
		bio?: string;
		company?: string;
		location?: string;
	} & Info
>;

export type GoogleUserInfo<Info = {}> = UserInfoBase<
	"google",
	{
		email?: string;
		email_verified?: boolean;
		sub: string;
		name?: string;
		picture?: string;
		given_name?: string;
		family_name?: string;
	} & Info
>;

export type JumpCloudUserInfo<Info = {}> = UserInfoBase<
	"jumpcloud",
	{
		sub: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		given_name?: string;
		family_name?: string;
	} & Info
>;

export type KeycloakUserInfo<Info = {}> = UserInfoBase<
	"keycloak",
	{
		sub: string;
		email?: string;
		email_verified?: boolean;
		preferred_username?: string;
		name?: string;
		given_name?: string;
		family_name?: string;
	} & Info
>;

export type MicrosoftUserInfo<Info = {}> = UserInfoBase<
	"microsoft",
	{
		id: string;
		displayName?: string;
		givenName?: string;
		surname?: string;
		mail?: string;
		userPrincipalName: string;
		jobTitle?: string;
	} & Info
>;

export type SpotifyUserInfo<Info = {}> = UserInfoBase<
	"spotify",
	{
		id: string;
		display_name?: string;
		email?: string;
		images?: Array<{ url: string; width: number; height: number }>;
		country?: string;
		product?: string;
	} & Info
>;

export type TwitchUserInfo<Info = {}> = UserInfoBase<
	"twitch",
	Array<{
		id: string;
		login: string;
		display_name: string;
		email?: string;
		profile_image_url?: string;
		broadcaster_type?: string;
	}> &
		Info
>;

export type YahooUserInfo<Info = {}> = UserInfoBase<
	"yahoo",
	{
		sub: string;
		name?: string;
		email?: string;
		email_verified?: boolean;
		picture?: string;
	} & Info
>;

export type OAuthUserInfo<Info = {}> = UserInfoBase<"oauth", {} & Info>;

export type UserInfo =
	| AppleOAuthUserInfo
	| AppleOIDCUserInfo
	| CodeUserInfo
	| OIDCUserInfo
	| PasswordUserInfo
	| XUserInfo
	| SlackUserInfo
	| CognitoUserInfo
	| DiscordUserInfo
	| FacebookUserInfo
	| GitHubUserInfo
	| GoogleUserInfo
	| JumpCloudUserInfo
	| KeycloakUserInfo
	| MicrosoftUserInfo
	| SpotifyUserInfo
	| TwitchUserInfo
	| YahooUserInfo
	| OAuthUserInfo;
