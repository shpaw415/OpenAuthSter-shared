import { OTFusersTable } from "./schema";
import {
  array,
  boolean,
  looseObject,
  number,
  object,
  string,
  nullable,
  undefinedable,
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

export type UserListItem = Omit<
  ReturnType<typeof OTFusersTable>["$inferSelect"],
  "session_private" | "session_public"
>;

export type GetUserListResponse = {
  success: boolean;
  data: {
    users: UserListItem[];
    total: number;
  };
};

export const UserListSchemaValidation = object({
  success: boolean(),
  data: object({
    users: array(
      object({
        id: string(),
        identifier: string(),
        data: looseObject({}),
        created_at: string(),
        session_public: undefinedable(looseObject({})),
        session_private: undefinedable(looseObject({})),
      }),
    ),
    total: number(),
  }),
});
