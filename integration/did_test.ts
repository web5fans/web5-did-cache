import { ccc, hexFrom, Address, bytesFrom } from "@ckb-ccc/core";
import { exit } from "process";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// @ts-ignore

const API_URL = 'http://localhost:3000';

const TEST_PRIVATE_KEY =  "0x88179b7e387921a193f459859d8ff461e973a93a449b4930179928dbc53a04ba";

const SIGN_SK = "0x9ff68d455f5f50774f6c0d6440599764aaa7b5e312be731bb3f8d48788762f0f"

const client = new ccc.ClientPublicTestnet();

const signer = new ccc.SignerCkbPrivateKey(client, TEST_PRIVATE_KEY);

async function main() {
  console.log('Starting DID Integration Test...');
  
  // 1. Get Sender Address
  const senderAddress = await signer.getRecommendedAddress();
  console.log(`Sender Address: ${senderAddress}`);

  // Check balance
  const senderAddrObj = await Address.fromString(senderAddress, client);
  const balance = await client.getBalance([senderAddrObj.script]);
  console.log(`Sender Balance: ${balance} shannons`);

  // 2. Create DID
  console.log('\n--- Step 1: Create DID ---');
  const metadata = JSON.stringify({
    services: {
        atproto_pds: {
            type: "AtprotoPersonalDataServer",
            endpoint: "https://pds.example.com"
        }
    },
    alsoKnownAs: ["at://alice.example.com"],
    verificationMethods: {
        atproto: "did:key:zQ3shvzLcx2TeGmV33sPsVieaXWdjYwAcGXfiVgSyfhe6JdHh"
    }
  });
  console.log('Metadata:', metadata);
  const secret = "test_secret_123";

  const createRes = await fetch(`${API_URL}/api/did/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata, secret })
  });

  if (!createRes.ok) {
    throw new Error(`Create failed: ${createRes.status} ${await createRes.text()}`);
  }

  const createData = await createRes.json();
  console.log('Create DID Response:', createData);
  const did = createData.did;

  if (createData.metadata !== metadata) {
    throw new Error('Metadata does not match');
  }

  // 3. Query DID
  // fetch /{did} to get metadata
  console.log('\n--- Step 2: Query DID ---');
  const didRes = await fetch(`${API_URL}/${did}`, {
    method: 'GET'
  });

  if (!didRes.ok) {
    throw new Error(`Query failed: ${didRes.status} ${await didRes.text()}`);
  }
  const didData = await didRes.json();
  console.log('Query DID Response:', didData);

  // 3. Update DID (Optional)
  console.log('\n--- Step 3: Update DID ---');
  const newMetadata = JSON.stringify({
    ...JSON.parse(metadata),
    alsoKnownAs: ["at://bob.example.com"]
  });

  const updateRes = await fetch(`${API_URL}/api/did/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({did, secret, metadata: newMetadata })
  });

  if (!updateRes.ok) {
    throw new Error(`Update failed: ${updateRes.status} ${await updateRes.text()}`);
  }
  console.log('Update DID Response:', await updateRes.json());

  // 4. Upgrade DID
  console.log('\n--- Step 3: Upgrade DID ---');
  
  // Sign sender address
  const message = Buffer.from(senderAddress);
  const sig = secp256k1.sign(
    message,
    bytesFrom(SIGN_SK),
    { prehash: false, format: 'recovered' }
  );
  const signature = hexFrom(sig);

  console.log('Signature:', signature);

  const upgradeRes = await fetch(`${API_URL}/api/did/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ did, sender: senderAddress, signature })
  });

  if (!upgradeRes.ok) {
      throw new Error(`Upgrade failed: ${upgradeRes.status} ${await upgradeRes.text()}`);
  }

  const upgradeData = await upgradeRes.json();
  console.log('Upgrade DID Response:', upgradeData);
  const rawTx = upgradeData.tx;
  console.log('Raw Transaction:', rawTx);

  // 5. Complete DID
  console.log('\n--- Step 4: Complete DID ---');
  
  // Sign the transaction
  const txObj = JSON.parse(rawTx);
  const tx = ccc.Transaction.from(txObj);

  const signedTx = await signer.signTransaction(tx);

  console.log('Signed Transaction:', ccc.stringify(signedTx));
  
  const completeRes = await fetch(`${API_URL}/api/did/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        did, 
        tx: ccc.stringify(signedTx)
    })
  });

  if (!completeRes.ok) {
    throw new Error(`Complete failed: ${completeRes.status} ${await completeRes.text()}`);
  }

  const completeData = await completeRes.json();
  console.log('Complete DID Response:', completeData);
  const txHash = completeData.txHash;
  console.log(`Waiting for transaction ${txHash} to commit...`);
  // wait 30s for transaction to commit
  await new Promise(r => setTimeout(r, 60000));

  // query did to check status
  const didResAfterComplete = await fetch(`${API_URL}/${did}`, {
    method: 'GET'
  });

  if (!didResAfterComplete.ok) {
    throw new Error(`Query failed: ${didResAfterComplete.status} ${await didResAfterComplete.text()}`);
  }
  const didDataAfterComplete = await didResAfterComplete.json();
  console.log('Query DID Response after complete:', didDataAfterComplete);
}

main().then(() => {
  console.log("PASS: Basic tests executed.");
  exit(0);
}).catch((err) => {
  console.error('FAIL:', err);
  exit(1);
});
