# Authentication

import { Callout } from "zudoku/ui/Callout.js";

All Binance Web3 API endpoints are protected by **API Key authentication**. Each request must be
signed using your Secret Key, ensuring that only authorized clients with valid credentials can
access the platform.

---

## Step 1 — Obtain API Credentials

Visit the [**Developer Portal**](https://web3.binance.com/en/dev-portal/project) to create a project
and generate an **API Key** and **Secret Key**:

| Credential   | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `API Key`    | Uniquely identifies your application (`X-OC-APIKEY` header)  |
| `Secret Key` | Used to sign requests (HMAC-SHA256 mode). Keep this private. |

---

## Step 2 — Understand Required Headers

Every authenticated request must include the following three headers:

| Header             | Required | Description                                                                                |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `X-OC-APIKEY`      | Yes      | Your API Key string                                                                        |
| `X-OC-TIMESTAMP`   | Yes      | Current UTC time in **ISO 8601** format with milliseconds, e.g. `2026-05-11T10:08:57.715Z` |
| `X-OC-SIGN`        | Yes      | Request signature (Base64-encoded), see [Step 3](#step-3--generate-the-signature)          |
| `X-OC-RECV-WINDOW` | No       | Allowed time deviation in milliseconds (default: `5000`, max: `60000`)                     |
| `X-OC-NONCE`       | No       | Unique request identifier for anti-replay; falls back to `X-OC-SIGN` if omitted            |

---

## Base URL & Required `/build` Prefix

All endpoints are served from the same host with a fixed **`/build` base path**:

```
Base URL = https://web3.binance.com/build
```

This means every request line on the HTTP wire starts with `/build/api/v1/...`, and **the
`requestPath` used in the signature (see Step 3) must also include the `/build` prefix** — exactly
as it appears on the wire.

<Callout type="caution">
  **Critical — the #1 cause of `40102 Invalid signature`:** omitting the
  `/build` prefix from the signed `requestPath`. A bare `/api/v1/...` in the
  signature string will fail signature verification even if the request itself
  is routed correctly. Always prefix the path with `/build` when building the
  pre-hash string.
</Callout>

| What                 | Value / Rule                                     |
| -------------------- | ------------------------------------------------ |
| Base URL             | `https://web3.binance.com/build`                 |
| Full request URL     | `https://web3.binance.com/build` + `/api/v1/...` |
| Signed `requestPath` | `/build/api/v1/...` (+ `?query` if present)      |
| `Host` header        | `web3.binance.com` (no path)                     |

A bare `https://web3.binance.com/api/v1/...` (without `/build`) is redirected to the `/build` prefix
at the edge — do not rely on that for signing. Always include `/build` explicitly in both the
request URL and the signed `requestPath`.

---

## Step 3 — Generate the Signature

### 3.1 Build the Pre-Hash String

Concatenate the following four components **without any separator**:

```
preHash = timestamp + method + requestPath + body
```

| Component     | Rule                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timestamp`   | Exact value of the `X-OC-TIMESTAMP` header (ISO 8601, e.g. `2026-05-11T10:08:57.715Z`)                                                                                                                                          |
| `method`      | HTTP method in **UPPERCASE** (e.g. `GET`, `POST`)                                                                                                                                                                               |
| `requestPath` | Full HTTP path **including the `/build` base-path prefix** plus query string, in **raw URL-encoded form**, e.g. `/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT`. See [Base URL](#base-url--required-build-prefix). |
| `body`        | Raw request body string for `POST`/`PUT`/`DELETE`; **empty string `""`** for `GET`/`HEAD`                                                                                                                                       |

<Callout type="caution">
  **Critical:** `requestPath` must use the exact raw-encoded form as sent on the
  HTTP wire — no percent-decoding, no query-parameter re-ordering, no parameter
  merging. It **must** start with the `/build` prefix; omitting it is the most
  common cause of `40102 Invalid signature`.
</Callout>

#### Example (GET request)

```
timestamp   = "2026-05-11T10:08:57.715Z"
method      = "GET"
requestPath = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
body        = ""

preHash = "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
```

#### Example (POST request)

```
timestamp   = "2026-05-11T10:08:57.715Z"
method      = "POST"
requestPath = "/build/api/v1/dex/swap"
body        = '{"chainId":1,"fromToken":"0xEEEE...","toToken":"0xA0b8...","amount":"1000000000000000000"}'

preHash = "2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/swap{\"chainId\":1,...}"
```

---

### 3.2 Sign with HMAC-SHA256 (Default)

Compute **HMAC-SHA256** over `preHash` using your `Secret Key`, then **Base64-encode** the result:

```
signature = Base64( HMAC-SHA256(preHash, secretKey) )
```

All strings are **UTF-8 encoded** before hashing.

#### JavaScript / Node.js

```js javascript
const crypto = require("crypto");

const timestamp = new Date().toISOString(); // e.g. "2026-05-11T10:08:57.715Z"
const method = "GET";
// NOTE: the path MUST include the /build base-path prefix — it is part of the signed requestPath.
const pathWithQuery =
  "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
const body = ""; // empty for GET

const preHash = timestamp + method + pathWithQuery + body;
const signature = crypto
  .createHmac("sha256", secretKey)
  .update(preHash, "utf8")
  .digest("base64");
```

#### Python

```python python
import hmac, hashlib, base64
from datetime import datetime, timezone

now        = datetime.now(timezone.utc)
timestamp  = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
method     = "GET"
# NOTE: the path MUST include the /build base-path prefix — it is part of the signed requestPath.
path_query = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
body       = ""

pre_hash   = timestamp + method + path_query + body
signature  = base64.b64encode(
    hmac.new(secret_key.encode("utf-8"), pre_hash.encode("utf-8"), hashlib.sha256).digest()
).decode("utf-8")
```

#### Java

```java java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

// pathWithQuery MUST include the /build base-path prefix — it is part of the signed requestPath.
String pathWithQuery = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
String preHash    = timestamp + method + pathWithQuery + body;
Mac mac           = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secretKey.getBytes("UTF-8"), "HmacSHA256"));
String signature  = Base64.getEncoder().encodeToString(
    mac.doFinal(preHash.getBytes("UTF-8"))
);
```

---

## Step 4 — Send the Request

Attach the three required headers to every authenticated request:

```http
GET /build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT HTTP/1.1
Host: web3.binance.com
X-OC-APIKEY:    your-api-key-here
X-OC-TIMESTAMP: 2026-05-11T10:08:57.715Z
X-OC-SIGN:      k3Y2mNpQr...base64sig...==
```

#### Complete JavaScript Example

```js javascript
const crypto = require("crypto");
const axios = require("axios");

const API_KEY = process.env.OC_API_KEY;
const SECRET_KEY = process.env.OC_SECRET_KEY;
// Base URL already includes the /build base-path prefix.
// Pass paths as /api/v1/... — the helper prepends /build for both the URL and the signature.
const BASE_URL = "https://web3.binance.com/build";
const BUILD_PREFIX = "/build";

async function get(path, params = {}) {
  // Use encodeURIComponent so spaces become %20 (not +), matching the raw wire encoding
  const queryStr = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const fullPath = queryStr ? `${path}?${queryStr}` : path;

  const timestamp = new Date().toISOString();
  // requestPath is the full path as sent on the wire — must include the /build prefix.
  const requestPath = BUILD_PREFIX + fullPath;
  const body = ""; // empty string for GET requests

  const preHash = timestamp + "GET" + requestPath + body;
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(preHash, "utf8")
    .digest("base64");

  const resp = await axios.get(BASE_URL + fullPath, {
    headers: {
      "X-OC-APIKEY": API_KEY,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
    },
  });
  return resp.data;
}

// Usage — pass the path WITHOUT /build; the helper prepends it for both URL and signature.
get("/api/v1/dex/aggregator/supported/chain", { binanceChainId: "56" }).then(
  console.log,
);
```

<Callout type="info">
  Whichever style you choose — passing `/build/...` paths explicitly, or letting
  a helper prepend `/build` — the key requirement is that the **signed
  `requestPath`** and the **request URL** both carry the `/build` prefix. Mixing
  the two (e.g. signing without `/build` but sending with it) will produce
  `40102 Invalid signature`.
</Callout>

---

## Timestamp & Anti-Replay

The gateway validates `X-OC-TIMESTAMP` on every authenticated request:

1. **Format**: Must be a valid ISO 8601 string (e.g. `2026-05-11T10:08:57.715Z`).
2. **Time window**: The request timestamp must be within `recv_window` milliseconds of server time.
   Default is **5 000 ms (5 s)**, configurable via `X-OC-RECV-WINDOW` (max **60 000 ms / 60 s**).
3. **Anti-replay**: Each nonce (`X-OC-NONCE` or the signature itself) is valid only once within the
   `2 × recv_window` time window. Replayed requests are rejected with error `40103`.

<Callout type="caution">
  Keep your system clock synchronized with an NTP server to avoid timestamp
  drift errors.
</Callout>

---

## Rate Limits

Authenticated requests are subject to four concurrent rate-limit dimensions:

| Dimension    | Default Limit   | Window | Response Header            |
| ------------ | --------------- | ------ | -------------------------- |
| Per IP       | 1 200 requests  | 60 s   | `X-OC-RateLimit-Limit`     |
| Per API Key  | 1 200 requests  | 60 s   | `X-OC-RateLimit-Remaining` |
| Per User     | 6 000 requests  | 60 s   | `X-OC-Used-Weight`         |
| Per Endpoint | 5 RPS (default) | 1 s    | `X-OC-Used-Weight`         |

When a limit is exceeded the gateway returns **HTTP 429** with a `Retry-After` header (in seconds).

---

## Error Codes

| HTTP Status | Error Code | Meaning                                  |
| ----------- | ---------- | ---------------------------------------- |
| 400         | `40001`    | Invalid request parameters               |
| 401         | `40101`    | API Key is missing, invalid, or disabled |
| 401         | `40102`    | Signature mismatch or missing            |
| 401         | `40103`    | Timestamp expired or request replayed    |
| 403         | `40104`    | API Key lacks required permission        |
| 429         | `42900`    | Rate limit exceeded                      |
| 500         | `50000`    | Internal server error                    |
| 503         | `50001`    | Service temporarily unavailable          |

All error responses follow the unified format:

```json
{
  "code": 40102,
  "msg": "Invalid signature",
  "data": null,
  "timestamp": 1715420937000
}
```

---

## Postman Quick Start

Add the following **Pre-request Script** to your Postman collection to auto-sign every request. In
your collection, set the base URL to `https://web3.binance.com/build` and configure every request
path as `/api/v1/...` — the script below prepends `/build` to the path when building the signature
so the signed `requestPath` matches what is sent on the wire.

```js javascript
// Binance Web3 API Gateway — Auto Sign Script
const apiKey = pm.variables.get("api_key");
const secretKey = pm.variables.get("secret_key");
if (!apiKey || !secretKey) {
  throw new Error("Set api_key and secret_key in Collection Variables first");
}

const timestamp = new Date().toISOString();
const method = pm.request.method.toUpperCase();
const url = pm.request.url;

const pathStr = "/" + (url.path || []).join("/");
const qParams = (url.query || []).filter((p) => !p.disabled && p.key);
const queryStr = qParams
  .map(
    (p) => encodeURIComponent(p.key) + "=" + encodeURIComponent(p.value || ""),
  )
  .join("&");
const pathWithQuery = queryStr ? pathStr + "?" + queryStr : pathStr;

// The signed requestPath MUST include the /build base-path prefix.
// Postman request paths are configured as /api/v1/... (without /build), so prepend it here.
const signedRequestPath = pathWithQuery.startsWith("/build")
  ? pathWithQuery
  : "/build" + pathWithQuery;

const body =
  method === "GET" || method === "HEAD"
    ? ""
    : pm.request.body
      ? pm.request.body.toString()
      : "";

const preHash = timestamp + method + signedRequestPath + body;
const signature = CryptoJS.enc.Base64.stringify(
  CryptoJS.HmacSHA256(preHash, secretKey),
);

pm.request.headers.upsert({ key: "X-OC-APIKEY", value: apiKey });
pm.request.headers.upsert({ key: "X-OC-TIMESTAMP", value: timestamp });
pm.request.headers.upsert({ key: "X-OC-SIGN", value: signature });
```

Set `api_key` and `secret_key` under **Collection → Variables** and every request will be signed
automatically.
