import {
  array,
  boolean,
  looseObject,
  number,
  object,
  string,
  nullable,
  type InferInput,
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
  PublicSessionData = any,
  PrivateSessionData = any,
  UserInfo = any,
> = InferInput<typeof UserListSchemaValidation> & {
  data: {
    users: Array<{
      id: string;
      identifier: string;
      data: UserInfo;
      created_at: string;
      session_public: PublicSessionData;
      session_private: PrivateSessionData;
    }>;
    total: number;
  };
};

export type UserResponseSchemaInferdType<
  PublicSessionData,
  PrivateSessionData,
  UserInfo,
> = Omit<
  UserResponseSchemaType<PublicSessionData, PrivateSessionData, UserInfo>,
  "data"
> & {
  data: {
    users: Array<{
      id: string;
      identifier: string;
      data: UserInfo;
      created_at: string;
      session_public: PublicSessionData;
      session_private: PrivateSessionData;
    }>;
    total: number;
  };
};
