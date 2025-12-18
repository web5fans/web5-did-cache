# Web5 DID Cache API Documentation

## 错误码 (Error Codes)

| Code | Description | HTTP Status |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 参数缺失或无效 (Missing or invalid parameters) | 400 |
| `NOT_FOUND` | 资源未找到 (Resource not found) | 404 |
| `STATE_MISMATCH` | 状态不匹配 (State mismatch) | 409 |
| `NO_PLATFORM_ADDRESS` | 无可用平台地址 (No available platform address) | 503 |
| `INSUFFICIENT_BALANCE` | 余额不足 (Sender does not have enough balance) | 422 |
| `INTERNAL_ERROR` | 服务器内部错误 (Internal server error) | 500 |

## 接口列表 (Endpoints)

### 1. 创建 DID (Create DID)

预创建一个 Web5 DID。

- **URL**: `/api/did/create`
- **Method**: `POST`
- **Content-Type**: `application/json`

**请求参数 (Request Body)**:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `metadata` | string | Yes | DID 文档的元数据 (JSON 字符串)。必须包含合法的 JSON 对象结构。 |
| `secret` | string | Yes | 用于后续更新验证的密钥 (如用户密码、Token 等)。 |

**Metadata 约束**:
- 必须是合法的 JSON 字符串。
- `services.atproto_pds`:
  - `type` 必须为 `"AtprotoPersonalDataServer"`
  - `endpoint` 必须为合法的 URL
- `alsoKnownAs`: 必须为字符串数组。
- `verificationMethods.atproto`:
  - 必须以 `did:key:` 开头
  - 长度必须为 56 字符

**响应示例 (Response)**:

```shell
curl -s -X POST http://localhost:3000/api/did/create \
-H "Content-Type: application/json" \
-d '{
    "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shvzLcx2TeGmV33sPsVieaXWdjYwAcGXfiVgSyfhe6JdHh\"}}",
  "secret": "user123"
}' | jq .
```
```json
{
  "id": 1,
  "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
  "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shvzLcx2TeGmV33sPsVieaXWdjYwAcGXfiVgSyfhe6JdHh\"}}"
}
```

### 2. 更新 DID (Update DID)

更新处于 `PREPARE` (准备) 状态的 DID 的元数据。

- **URL**: `/api/did/update`
- **Method**: `POST`
- **Content-Type**: `application/json`

**请求参数 (Request Body)**:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `did` | string | Yes | 要更新的 DID。 |
| `secret` | string | Yes | 创建时设置的密钥。 |
| `metadata` | string | Yes | 新的元数据 (JSON 字符串)。约束同创建接口。 |

**响应示例 (Response)**:

```shell
curl -s -X POST http://localhost:3000/api/did/update \
-H "Content-Type: application/json" \
-d '{
    "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
    "secret": "user123",
    "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shYkVikykaM2Xm7i7eijghrXrLHT6MBqiLfkC1HPKione9\"}}"
}' | jq .
```

```json
{
  "id": 1,
  "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
  "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shYkVikykaM2Xm7i7eijghrXrLHT6MBqiLfkC1HPKione9\"}}"
}
```

### 3. 升级 DID (Upgrade DID)

将 DID 状态升级为 `UPGRADE`，并生成上链所需的 2-2 交易。

- **URL**: `/api/did/upgrade`
- **Method**: `POST`
- **Content-Type**: `application/json`

**请求参数 (Request Body)**:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `did` | string | Yes | 要升级的 DID。 |
| `sender` | string | Yes | 发送者 CKB 地址 (用于支付费用和作为 DID Owner)。 |
| `signature` | string | Yes | 发送者对地址的签名 (用于验证身份)。 |

**响应示例 (Response)**:

```shell
curl -s -X POST http://localhost:3000/api/did/upgrade \
-H "Content-Type: application/json" \
-d '{
    "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
    "sender": "ckt1qzda0cr08m82uyeru4fwp50709p186044fck5244w3c9w2h39u423234",
    "signature": "..."
}' | jq .
```

```json
{
  "id": 1,
  "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
  "tx": "..." // 原始交易 JSON 字符串
}
```

### 4. 完成 DID (Complete DID)

提交用户签名的交易，完成 DID 上链。

- **URL**: `/api/did/complete`
- **Method**: `POST`
- **Content-Type**: `application/json`

**请求参数 (Request Body)**:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `did` | string | Yes | 要完成的 DID。 |
| `tx` | object | Yes | 用户签名后的交易对象。 |

**响应示例 (Response)**:

```shell
curl -s -X POST http://localhost:3000/api/did/complete \
-H "Content-Type: application/json" \
-d '{
    "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
    "tx": {...} // 用户签名后的交易对象
}' | jq .
```

```json
{
  "id": 1,
  "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
  "txHash": "0x67e228a021e9e00feef11d8e89e6c9668dd85f73e22d7b8c297b10810e02048e" // 上链的交易哈希
}
```

### 5. 根据id查询DID

根据 DID 数据库中的 ID 查询 DID 记录。

- **URL**: `/api/did/id/:id`
- **Method**: `GET`

**响应示例 (Response)**:

```shell
curl -s -X GET http://localhost:3000/api/did/id/1 | jq .
```

```json
{
  "id": 1,
  "platform_address_index": 0,
  "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
  "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shYkVikykaM2Xm7i7eijghrXrLHT6MBqiLfkC1HPKione9\"}}",
  "status": 0,
  "sender": null,
  "tx_hash": null,
  "created_at": "2025-12-19T08:33:23.302Z",
  "updated_at": "2025-12-19T08:37:08.632Z"
}
```

### 6. 获取所有 DID (List DIDs)

获取系统内所有 DID 记录 (管理接口)。

- **URL**: `/api/did/all`
- **Method**: `GET`

**响应示例 (Response)**:

```shell
curl -s -X GET http://localhost:3000/api/did/all | jq .
```

```json
[
  {
    "id": 2,
    "platform_address_index": 1,
    "did": "did:ckb:fkngkffxrkcmuwq7ccpmytyhsue7b7pv",
    "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shvzLcx2TeGmV33sPsVieaXWdjYwAcGXfiVgSyfhe6JdHh\"}}",
    "secret": "user123",
    "status": 0,
    "sender": null,
    "signature": null,
    "tx_hash": null,
    "created_at": "2025-12-19T08:33:52.354Z",
    "updated_at": "2025-12-19T08:33:52.354Z"
  },
  {
    "id": 1,
    "platform_address_index": 0,
    "did": "did:ckb:zql3n3uotku4vp4opejkoqivsjukz573",
    "metadata": "{\"services\":{\"atproto_pds\":{\"type\":\"AtprotoPersonalDataServer\",\"endpoint\":\"https://web5.ccfdao.dev\"}},\"alsoKnownAs\":[\"at://david.web5.ccfdao.dev\"],\"verificationMethods\":{\"atproto\":\"did:key:zQ3shYkVikykaM2Xm7i7eijghrXrLHT6MBqiLfkC1HPKione9\"}}",
    "secret": "user123",
    "status": 0,
    "sender": null,
    "signature": null,
    "tx_hash": null,
    "created_at": "2025-12-19T08:33:23.302Z",
    "updated_at": "2025-12-19T08:37:08.632Z"
  }
]
```

### 7. 查询 DID (Get DID)

查询 DID 的元数据。

- **URL**: `/:did`
- **Method**: `GET`

**行为**:
- 如果 DID 不存在或状态为 `COMPLETE` (已上链)，将 **302 Redirect** 到 Web5 DID Indexer 服务。
- 如果 DID 状态未完成，直接返回数据库中存储的 `metadata` JSON 对象。

**响应示例 (未完成状态)**:

```shell
curl -s -X GET http://localhost:3000/did:ckb:zql3n3uotku4vp4opejkoqivsjukz573 | jq .
```

```json
{
  "services": {
    "atproto_pds": {
      "type": "AtprotoPersonalDataServer",
      "endpoint": "https://web5.ccfdao.dev"
    }
  },
  "alsoKnownAs": [
    "at://david.web5.ccfdao.dev"
  ],
  "verificationMethods": {
    "atproto": "did:key:zQ3shYkVikykaM2Xm7i7eijghrXrLHT6MBqiLfkC1HPKione9"
  }
}
```
