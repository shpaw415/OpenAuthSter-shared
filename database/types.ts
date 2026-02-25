import type { ProviderType } from "..";
import { OTFusersTable } from "./schema";

export type OTFUsersType = {
  select: ReturnType<typeof OTFusersTable>["$inferSelect"];
  insert: ReturnType<typeof OTFusersTable>["$inferInsert"];
};

export type OTFUsersParsedType = Omit<
  OTFUsersType["select"],
  "data" | "session_private" | "session_public"
> & {
  data: Record<string, any> & { provider: Omit<ProviderType, "qr"> };
  session_private: Record<string, any> | null;
  session_public: Record<string, any> | null;
};
