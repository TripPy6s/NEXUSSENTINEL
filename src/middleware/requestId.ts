import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

export const requestIdHeader = "x-request-id";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header(requestIdHeader);
  const id = incoming && incoming.trim().length > 0 ? incoming : randomUUID();
  (req as any).requestId = id;
  res.setHeader(requestIdHeader, id);
  next();
}

export function getRequestId(req: Request): string | undefined {
  return (req as any).requestId;
}
