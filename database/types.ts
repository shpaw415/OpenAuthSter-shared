import type { ProviderType } from "..";
import type { OTFusersTable } from "./schema";

export type OTFUsersType = {
	select: ReturnType<typeof OTFusersTable>["$inferSelect"];
	insert: ReturnType<typeof OTFusersTable>["$inferInsert"];
};

export type OTFUsersParsedType<
	Public extends Record<string, unknown> | null = Record<string, unknown>,
	Private extends Record<string, unknown> | null = Record<string, unknown>,
> = Omit<
	OTFUsersType["select"],
	"data" | "session_private" | "session_public"
> & {
	data: Record<string, unknown> & { provider: Omit<ProviderType, "qr"> };
	session_private: Private | null;
	session_public: Public | null;
};
