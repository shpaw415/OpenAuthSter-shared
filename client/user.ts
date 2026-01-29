import type { Client } from "@openauthjs/openauth/client";
import * as v from "valibot";
import type { InferOutput } from "valibot";
export const userEndpointURI = "/user-endpoint" as const;

export const UserEndpointValidation = v.object({
  id: v.string(),
  type: v.union([v.literal("public"), v.literal("private")]),
  action: v.union([v.literal("get"), v.literal("update")]),
  data: v.optional(v.any()),
  clientID: v.string(),
  token: v.string(),
});

type RequestData = InferOutput<typeof UserEndpointValidation>;

export type ClientProps = {
  issuerURI: string;
  openAuthClient: Client;
  clientID: string;
  userId?: string;
  token: string | null;
  refreshToken: string | null;
  // Server side ONLY !!
  secret?: string;
};

export function createOpenAuthsterClient() {}

export class OpenAuthsterClient {
  issuerURI: string;
  openAuthClient: Client;
  clientID: string;
  secret?: string;
  userId?: string;
  token: string | null = null;
  refreshToken: string | null = null;

  constructor(props: ClientProps) {
    this.issuerURI = props.issuerURI;
    this.openAuthClient = props.openAuthClient;
    this.secret = props.secret;
    this.userId = props.userId;
    this.token = props.token;
    this.refreshToken = props.refreshToken;
    this.clientID = props.clientID;
  }

  private ensureReady() {
    if (!this.token) {
      throw new Error("Client is not authenticated. Token is missing.");
    }
    if (!this.userId) {
      throw new Error("Client is not authenticated. User ID is missing.");
    }
  }

  getUserSession(type: RequestData["type"]) {
    this.ensureReady();
    const body = this.createFormData({
      action: "get",
      type,
      id: this.userId!,
      clientID: this.clientID,
      token: this.token!,
    });

    return this.createFetch(body);
  }

  private createFormData(data: RequestData): FormData {
    const formData = new FormData();
    formData.append("action", data.action);
    formData.append("type", data.type);
    formData.append("id", data.id);
    formData.append("clientID", data.clientID);
    if (data.data) {
      formData.append("data", JSON.stringify(data.data));
    }
    return formData;
  }

  private createFetch(body?: RequestInit<RequestInitCfProperties>["body"]) {
    const header = this.token ? `Bearer ${this.token}` : "";

    return fetch(`${this.issuerURI}${userEndpointURI}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: this.token ? `Bearer ${this.token}` : "",
        "X-Client-Secret": this.secret ? this.secret : "",
      },
      credentials: "include",
      body,
    });
  }
}
