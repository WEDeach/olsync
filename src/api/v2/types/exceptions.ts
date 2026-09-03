import APIError from "./api_error";

export default class APIException extends Error {
    status?: number;
    constructor(error: APIError, status?: number) {
        super(`${error.error} (${(error.message || error.error_description) ?? "Unknown error."})`);
        this.name = "APIError";
        this.status = status;
    }
}
