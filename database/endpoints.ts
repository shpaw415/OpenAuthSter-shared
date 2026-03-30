import {
	array,
	boolean,
	type InferInput,
	looseObject,
	nullable,
	number,
	object,
	string,
} from "valibot";

export type UserPageFilter =
	| {
			page: number;
			limit: number;
	  }
	| {
			page?: number;
			limit?: number;
	  };

export type GetUserListFilters = UserPageFilter;

export type ResponseBaseData<Data> = {
	success: boolean;
	error?: string;
	data: Data;
};

export const UserListSchemaValidation = object({
	success: boolean(),
	data: nullable(
		object({
			users: array(
				object({
					id: string(),
					identifier: string(),
					data: looseObject({}),
					created_at: string(),
					role: nullable(string()),
					session_public: nullable(looseObject({})),
					session_private: nullable(looseObject({})),
				}),
			),
			total: number(),
		}),
	),
	error: nullable(string()),
});

export type UserResponseSchemaType<
	PublicSessionData extends Record<string, unknown> | null,
	PrivateSessionData extends Record<string, unknown> | null,
	UserInfo extends Record<string, unknown>,
	Roles extends string,
> = InferInput<typeof UserListSchemaValidation> & {
	data: {
		users: Array<{
			id: string;
			identifier: string;
			role: Roles | null;
			data: UserInfo;
			created_at: string;
			session_public: PublicSessionData;
			session_private: PrivateSessionData;
		}>;
		total: number;
	};
};

export type UserResponseSchemaInferdType<
	PublicSessionData extends Record<string, unknown> | null,
	PrivateSessionData extends Record<string, unknown> | null,
	UserInfo extends Record<string, unknown>,
	Roles extends string,
> = Omit<
	UserResponseSchemaType<
		PublicSessionData,
		PrivateSessionData,
		UserInfo,
		Roles
	>,
	"data"
> & {
	data: {
		users: Array<{
			id: string;
			identifier: string;
			role: Roles | null;
			data: UserInfo;
			created_at: string;
			session_public: PublicSessionData;
			session_private: PrivateSessionData;
		}>;
		total: number;
	};
};
