import { corsHeaders } from "../const/index.ts";


export class AppResponse<T> extends Response {
  constructor(statusCode: number = 200, body: T) {
    super(JSON.stringify(body), {
      status: statusCode,
      headers: corsHeaders,
    });
  }
}