import { OTFusersTable } from "./schema";
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
