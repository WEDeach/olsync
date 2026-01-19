import APIError from "./api_error";

export default class APIException extends Error {
    constructor(error: APIError) {
        super(`${error.error} (${(error.message||error.error_description)??"Unknown error."})`);
        this.name="APIError";
    }
}