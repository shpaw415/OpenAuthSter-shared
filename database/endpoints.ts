import { OTFusersTable } from "./schema";
import {
  array,
  boolean,
  looseObject,
  number,
  object,
  string,
  nullable,
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

export type UserListItem = Omit<
  ReturnType<typeof OTFusersTable>["$inferSelect"],
  "session_private" | "session_public"
> & {
  session_public: Record<string, any> | null;
  session_private: Record<string, any> | null;
};

export type GetUserListResponse = ResponseBaseData<{
  users: UserListItem[];
  total: number;
}>;

export type UpdateUserFromIDResponseData = ResponseBaseData<UserListItem>;

export const UserListSchemaValidation = object({
  success: boolean(),
  data: object({
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
});
