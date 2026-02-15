import { OTFusersTable } from "openauth-webui-shared-types/database";

export type OTFUsersType = {
  select: ReturnType<typeof OTFusersTable>["$inferSelect"];
  insert: ReturnType<typeof OTFusersTable>["$inferInsert"];
};

export type OTFUsersParsedType = Omit<
  OTFUsersType["select"],
  "data" | "session_private" | "session_public"
> & {
  data: Record<string, any>;
  session_private: Record<string, any> | null;
  session_public: Record<string, any> | null;
};
