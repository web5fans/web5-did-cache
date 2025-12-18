# web5 did cache

web5 did cache 是一个 did 缓存服务，用于缓存 web5 did 文档。

## 功能

- 可以中心化的预创建web5 did。
- 将创建 web5 did 的过程异步化，改进web5 应用的注册体验。

## web5 did 注册过程中的问题

web5 did 创建在 ckb 链上，需要用户使用 ckb 钱包签名并发送创建交易。

第一个问题是：创建等待时间过长。

参照bluesky的创建账户体验，因为是中心化服务，用户在输入信息之后，马上就可以完成账户创建并开始使用。

这样就可以在账户创建流程的后半段去完善个人信息。

但是 web5 did 的创建流程涉及上链操作，用户需要等待几十秒才能完成创建。

就无法实现创建即开始使用的体验。比如完善个人信息，就需要单独设计交互方案。

第二个问题是：中心化方案比较复杂。

如果用户没有条件，比如没有 ckb 钱包，或者用户不愿意为创建交易支付费用，宁愿选择中心化方案。

在 web5 did 标准中，对于这类用户，建议使用 PLC did，而且提供了从 PLC did 到 web5 did 的升级方案。

但是 PLC did 和 web5 did 有一些区别。

升级的过程相当于，用户先申请身份证，然后再去办护照。

这会导致web5 应用面临一些复杂的情况:

假如用户要买机票，既可以用身份证，也可以用护照。那么机票系统就得同时支持身份证和护照。更麻烦的是，对于同一个人，用身份证时在应用系统中产生的数据和他用护照时在应用系统中产生的数据，要不要放到一起？还是把他们看成是两个不同的人？

## 解决方案

web5 的 did 跟 typeid 一样，取决于创建交易中的 input[0]。

所以可以有一个中心化的服务，通过推导钱包，给每个预创建 web5 did 的用户分配一个地址。

每个地址里面放一个cell（最小61ckb），根据这个 cell（假设它是创建交易的input[0]）计算出一个 web5 did，直接给用户使用。

同时，中心化服务记录下用户的 did doc。这个预创建的 web5 did 的解析工作也由中心化服务来负责。

后续用户想要升级成真正的 web5 did 的时候，真正构造出创建 web5 did 的交易并发上链就可以了。

同时这笔创建交易设计成2-2交易，中心化服务的 cell 作为 input[0]，并在output中回到原平台地址，用户钱包补充其他 inputs，提供创建 web5 did 的所有费用（占用费和交易费）。

这样中心化服务每个预创建 web5 did 的用户的成本只是 61ckb 的一段时间的占用而已。

# 技术方案

### 平台 live cell 管理

因为 2-2 交易中，input cell 需要被锁定，防止被重复使用。

为了应对并发，平台配置一个助记词，通过该助记词派生出多个地址。

助记词及推导出的地址可以使用 https://app.ckbccc.com/utils/Mnemonic 来生成。

例如对于示例配置，平台会派生出 10 个地址。

```
Path: m/44'/309'/0'/0/0, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq03uhjkgx3czrl04n92usrklyd9mezywfsk8tjwm
Path: m/44'/309'/0'/0/1, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqve9g9gg3rtsp4gxw2dtdrc43jzvrhttxsp2ev93
Path: m/44'/309'/0'/0/2, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdm9qgx0est2qlkdqgpth5f7ju9qpxtcpqagv8w9
Path: m/44'/309'/0'/0/3, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfj3fq244fc9r82gt5hcka9ertn46pwkmgtu7ced
Path: m/44'/309'/0'/0/4, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2sv5sawcueag00wsqdsq7djl9vmx7xk0g05efqm
Path: m/44'/309'/0'/0/5, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqd44t5xqmrapwdkky5593ekg0vpaj7mwxqzla4z4
Path: m/44'/309'/0'/0/6, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwxpce7d4lqz5504jx7zfer6y3909jw5vccefqtx
Path: m/44'/309'/0'/0/7, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqteg2963k7sz3f587vzhz9x2u6ew2x924q0l2agv
Path: m/44'/309'/0'/0/8, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0ehj0tyljzpvl5tu3r59udjzljgn3kdtcfmn47e
Path: m/44'/309'/0'/0/9, Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdczyxt5nz6d2s95vel3msrntd8hslxucgx2czac
```

每个地址上只有一个 live cell，金额为 61 CKB。

每个创建请求来了之后，从多个地址中挑选一个使用，并进行标记，防止重复使用。

```
CREATE TABLE IF NOT EXISTS platform_address(
    id INTEGER PRIMARY KEY,
    index INTEGER,
    is_used BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### web5 did 创建记录存储

每个创建请求对应一条记录。

包含以下字段：

```
CREATE TABLE IF NOT EXISTS did(
    id BIGINT PRIMARY KEY,
    platform_address_index INTEGER,
    did TEXT,
    metadata TEXT,
    secret TEXT,      // 用于验证用户身份的 secret，例如用户的邮箱，手机号等
    status INTEGER, // 0: prepare, 1: upgrade, 2: pending 3: complete
    sender TEXT,    // 发送者ckb地址
    signature TEXT, // 发送者使用did doc中的signkey对sender的签名
    tx_hash TEXT,   // 2-2交易的hash
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
);
```

### API

平台需要提供 4 个 API 接口。

- 创建接口。
  发送者调用该接口，请求包含metadata，secret。
  平台首先从多个平台地址中挑选一个未使用的地址。并根据平台地址中的cell计算出一个 web5 did。
  将did 和 metadata 等信息存储到数据库的did表中，状态设置为 prepare。
  返回包含id，did，metadata。
- 更新接口。
  发送者调用该接口，请求包含did，secret 和 新的metadata。
  平台验证 did 是否存在，状态是否为 prepare。
  然后验证secret信息是否和数据库中的一致。
  如果一致，更新数据库中的metadata。
  返回包含id，did，新的metadata。
- 升级接口。
  发送者调用该接口，请求包含did，sender，signature。
  其中 signature 是发送者使用 did doc 中的 signkey 对 sender 地址进行签名的结果。
  平台验证 signature 是否正确。
  如果正确，记录 sender 和 signature。
  构造 2-2 交易。
  1. 对应平台地址中的cell作为 input[0]
  2. output[0]是did cell。其lock是sender，data是metadata.
  3. output[1]是一个普通cell，lock是平台地址, 金额为61 CKB。
  4. sender 地址补充其他的cell。
  记录 2-2 交易的 hash 到数据库中，并将状态设置为 upgrade。
  返回：id, did, 2-2 交易.
  用户拿到 2-2 交易之后，使用自己的钱包对交易进行部分签名，并调用接下来的完成接口。
- 完成接口。
  发送者调用该接口，请求包含 did 以及用户完成部分签名的2-2交易。
  平台验证交易是否正确。
  如果正确，调用平台地址的私钥补全 2-2 交易的签名，并发送上链。
  更新tx hash，并将状态设置为 pending。
  返回成功或者失败的错误信息。
  后续会有一个后台任务，定时查询数据库中状态为 pending 的交易，检查是否上链成功。
  如果上链成功，将状态设置为 complete。

### 后台任务

- 检查upgrade状态任务。
  每 30 秒检查一次数据库中状态为 upgrade 的记录。
  如果记录的 updated_at 超过 60 秒，将状态重置为 prepare。
- 检查pending状态任务。
  每 30 秒检查一次数据库中状态为 pending 的记录。
  如果对应的交易上链成功，将状态设置为 complete。
  如果对应的交易上链失败，则将状态重置为 prepare。


### 查询接口

查询接口包括：

- 查询所有的 did 记录。包含 did，metadata，secret，状态，发送者地址，签名，交易 hash 等。该接口为管理接口，生产部署切记对外屏蔽该接口。
- 根据 did 查询 metadata。前3个状态下返回数据库中的记录，complete 状态下将请求重定向到上游web5 did indexer服务。

## 运行

1. 环境变量

参见示例 `.env` 文件。

环境变量：
- DB_HOST ：数据库主机地址，默认值 `localhost`
- DB_PORT ：数据库端口号，默认值 `5432`
- DB_USER ：数据库用户名，默认值 `postgres`
- DB_PASSWORD ：数据库密码，默认值 `123456`
- DB_NAME ：数据库名称，默认值 `postgres`
- PORT ：服务端口号，默认值 `3000`
- PLATFORM_MNEMONIC ：平台助记词，无默认值，必须用户设置。例如 `calm gown solid jaguar card web paper loan scale sister rebel syrup`
- PLATFORM_ADDRESS_COUNT ：平台地址数量，默认值 `2`
- CKB_NETWORK ：CKB 网络，默认值 `ckb_testnet`，可选值 `ckb_testnet` 或者 `ckb`
- TRANSFER_FEE ：转账手续费，单位是 shannons，默认值 `10000`
- WEB5_DID_INDEXER_URL ：web5 did indexer 服务地址，默认值 `http://localhost:3001`
- ENABLE_ADMIN_API ：是否启用管理员接口，默认值 `true`，可选值 `true` 或者 `false`，建议在生产环境中关闭该接口。

2. 安装依赖
```
npm install
```

3. 运行服务
```
bash dev_db.sh
npm start
```

## API 文档与错误码

详见 `docs/API.md` 获取完整的接口说明、请求校验、错误码与示例响应。
