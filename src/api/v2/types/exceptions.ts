import APIError from "./api_error";

export default class APIException extends Error {
    status?: number;
    constructor(error: APIError, status?: number) {
        const detail = error.message || error.error_description;
        const summary = error.error || (status !== undefined ? `HTTP ${status}` : "Unknown error");
        super(detail ? `${summary} (${detail})` : summary);
        this.name = "APIError";
        this.status = status;
    }
}
