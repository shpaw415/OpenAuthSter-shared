import { type OTFUsersParsedType } from "./types";
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

export type UserResponseSchemaType = InferInput<
  typeof UserListSchemaValidation
>;
