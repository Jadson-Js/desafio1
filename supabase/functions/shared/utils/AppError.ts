export class AppError extends Error {
  statusCode: number;

  constructor(statusCode = 500, message = "Internal Server Error"){
    super(message);
    this.statusCode = statusCode;
  }

  static unauthorized(message = "User not authenticated") {
    return new AppError(401, message);
  }
  
  static badRequest(message = "Bad request") {
    return new AppError(400, message);
  }

  static conflict(message = "Operation cannot be completed due to conflict") {
    return new AppError(409, message);
  }
}