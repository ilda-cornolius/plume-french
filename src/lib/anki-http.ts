import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import type { IncomingMessage } from "http";
import { URL } from "url";

export type RawHttpResponse = {
  status: number;
  headers: Record<string, string>;
  /** All header names as received (lowercased keys map to first value). */
  headerNames: string[];
  body: Buffer;
  url: string;
};

function collectHeaders(res: IncomingMessage): {
  headers: Record<string, string>;
  headerNames: string[];
} {
  const headers: Record<string, string> = {};
  const headerNames: string[] = [];
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined) continue;
    headerNames.push(k);
    const key = k.toLowerCase();
    headers[key] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return { headers, headerNames };
}

/** Low-level request that never auto-follows redirects and exposes raw headers. */
export function rawRequest(
  urlStr: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer;
    timeoutMs?: number;
  } = {}
): Promise<RawHttpResponse> {
  const url = new URL(urlStr);
  const lib = url.protocol === "http:" ? httpRequest : httpsRequest;
  const method = opts.method || "GET";
  const body = opts.body;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise((resolve, reject) => {
    const req = lib(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          ...(opts.headers || {}),
          ...(body ? { "Content-Length": String(body.length) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const { headers, headerNames } = collectHeaders(res);
          resolve({
            status: res.statusCode || 0,
            headers,
            headerNames,
            body: Buffer.concat(chunks),
            url: urlStr,
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`AnkiWeb request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export function pickLocation(headers: Record<string, string>): string | null {
  return (
    headers["location"] ||
    headers["Location"] ||
    headers["x-anki-location"] ||
    null
  );
}
