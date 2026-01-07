import { Address, hexFrom, Transaction, hashTypeId, HasherCkb } from "@ckb-ccc/core";
import { ccc } from "@ckb-ccc/ccc";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base32 } from "@scure/base";
import { createPlatformAddress, getAllPlatformAddress } from "../models/platformAddress.js";
import dotenv from 'dotenv';

// load environment variables
dotenv.config();

// Platform configuration
export const MIN_AMOUNT = BigInt(61 * 10**8); // 61 CKB in shannons
// Transfer fee in shannons
export const TRANSFER_FEE = process.env.TRANSFER_FEE ? BigInt(process.env.TRANSFER_FEE) : BigInt(10000);

const PLATFORM_MNEMONIC = process.env.PLATFORM_MNEMONIC;
const CKB_NETWORK = process.env.CKB_NETWORK || 'ckb_testnet';

// Generate multiple platform addresses
const PLATFORM_ADDRESS_COUNT = Number(process.env.PLATFORM_ADDRESS_COUNT || 2);
const platformAddresses: string[] = [];

// CKB client
const cccClient = CKB_NETWORK === 'ckb_testnet' ? new ccc.ClientPublicTestnet() : new ccc.ClientPublicMainnet();

// Initialize platform addresses
export async function initPlatformAddresses() { 
  if (!PLATFORM_MNEMONIC) {
    throw new Error('PLATFORM_MNEMONIC is not set');
  }
  // get all platform addresses from database
  const existingAddresses = await getAllPlatformAddress();
  
  console.log(`Found ${existingAddresses.length} platform addresses in database`);
  
  // add existing addresses to platformAddresses
  for (const addr of existingAddresses) {
    platformAddresses.push(addr.address);
  }

  if (existingAddresses.length >= PLATFORM_ADDRESS_COUNT) {
    return;
  }

  if (!bip39.validateMnemonic(PLATFORM_MNEMONIC, wordlist)) {
    throw new Error('PLATFORM_MNEMONIC is invalid');
  }
  const seed = await bip39.mnemonicToSeed(PLATFORM_MNEMONIC);
  const hdKey = HDKey.fromMasterSeed(seed);
  
  // Generate and store platform addresses
  for (let i = existingAddresses.length; i < PLATFORM_ADDRESS_COUNT; i++) {
    const path = `m/44'/309'/0'/0/${i}`;
    const derivedKey = hdKey.derive(path);
    const publicKey = derivedKey.publicKey!;
    const address = await new ccc.SignerCkbPublicKey(
            cccClient,
            publicKey,
          ).getRecommendedAddress();
    console.log(`Path: ${path}, Address: ${address}`);
    
    // Store address in database
    await createPlatformAddress(address, i);
    
    platformAddresses.push(address);
  }
  
  console.log(`Initialized ${platformAddresses.length} platform addresses`);
}

async function getPrivateKey(index: number): Promise<string> {
  if (!PLATFORM_MNEMONIC) {
    throw new Error('PLATFORM_MNEMONIC is not set');
  }
  if (!bip39.validateMnemonic(PLATFORM_MNEMONIC, wordlist)) {
    throw new Error('PLATFORM_MNEMONIC is invalid');
  }

  if (index < 0 || index >= PLATFORM_ADDRESS_COUNT) {
    throw new Error('Invalid platform address index');
  }

  const seed = await bip39.mnemonicToSeed(PLATFORM_MNEMONIC);
  const hdKey = HDKey.fromMasterSeed(seed);

  const path = `m/44'/309'/0'/0/${index}`;
  const derivedKey = hdKey.derive(path);
  return hexFrom(derivedKey.privateKey!);
}

export async function getAddressBalance(ckbAddress: string): Promise<bigint> {
  const addr = await Address.fromString(ckbAddress, cccClient);
  const balance = await cccClient.getBalance([addr.script]);
  return balance;
}

export async function completeTransaction(platformAddressIndex: number, partSignedTx: string) {
  try {
    const txObj = JSON.parse(partSignedTx);

    const tx = Transaction.from(txObj);

    const platformPrivateKey = await getPrivateKey(platformAddressIndex);
    const platformSigner = new ccc.SignerCkbPrivateKey(cccClient, platformPrivateKey);

    const signedTx = await platformSigner.signTransaction(tx);
    console.log('signedTx:', signedTx);

    const txHash = await cccClient.sendTransaction(signedTx);
    console.log('sendTransaction txHash:', txHash);
    return txHash;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error completing transfer:', error.message);
    }
    throw error;
  }
}

// check transaction status
//export type TransactionStatus =
//  | "sent"
//  | "pending"
//  | "proposed"
//  | "committed"
//  | "unknown"
//  | "rejected";
export async function getTransactionStatus(txHash: string): Promise<string | undefined> {
  try {
    const txStatus = await cccClient.getTransaction(txHash);
    return txStatus?.status;
  } catch (error) {
    console.error('Error checking transaction status:', error);
    throw error;
  }
}

export async function calculateDid(platformAddressIndex: number): Promise<string> {
  const platformAddress = platformAddresses[platformAddressIndex];
  if (!platformAddress) {
    throw new Error('Invalid platform address index');
  }
  
  const platformAddr = await Address.fromString(platformAddress, cccClient);
  const platformSigner = new ccc.SignerCkbScriptReadonly(cccClient, platformAddr.script);
  
  let platformCell;
  for await (const cell of platformSigner.findCells({
    scriptLenRange: [0, 1],
    outputDataLenRange: [0, 1],
  }, false, "asc", 1)) {
    platformCell = cell;
    break;
  }
  
  if (!platformCell) {
    throw new Error(`No cell found for platform address ${platformAddress}`);
  }

  const cellInput = {
    previousOutput: platformCell.outPoint,
    since: "0x0",
  };
  
  // Calculate TypeID. DID cell will be output 1.
  const typeId = hashTypeId(cellInput, 1);
  const args = ccc.bytesFrom(typeId.slice(0, 42)); // 20 bytes TypeId
  const did = `did:ckb:${base32.encode(args).toLowerCase()}`;
  return did;
}

// add special tx hash method
// only calc inputs and outputs and outputData
export function calcAppTxHash(tx: Transaction): string {
  const hasher = new HasherCkb();
  for (const input of tx.inputs) {
    hasher.update(input.toBytes());
  }
  for (const output of tx.outputs) {
    hasher.update(output.toBytes());
  }
  for (const data of tx.outputsData) {
    hasher.update(data);
  }
  return hasher.digest();
}


export async function buildUpgradeTransaction(
  platformAddressIndex: number,
  senderAddress: string,
  metadata: string
) {
  try {
    // clean client cache
    await cccClient.cache.clear();

    const platformAddress = platformAddresses[platformAddressIndex];
    if (!platformAddress) {
      throw new Error('Invalid platform address index');
    }

    const senderAddr = await Address.fromString(senderAddress, cccClient);
    const platformAddr = await Address.fromString(platformAddress, cccClient);

    const senderSigner = new ccc.SignerCkbScriptReadonly(cccClient, senderAddr.script);
    const platformSigner = new ccc.SignerCkbScriptReadonly(cccClient, platformAddr.script);

    const returnPlatformTx = Transaction.from({
      outputs: [
        {
          capacity: ccc.numToHex(MIN_AMOUNT),
          lock: platformAddr.script,
        }
      ],
    });

    const metadataObj = JSON.parse(metadata);
    const { tx } = await ccc.didCkb.createDidCkb({
      signer: platformSigner,
      data: { value: { document: metadataObj} },
      receiver: senderAddr.script,
      tx: returnPlatformTx,
    });

    await tx.completeInputsByCapacity(senderSigner);
    await tx.completeFeeBy(senderSigner);

    const rawTx = ccc.stringify(tx);
    const txHash = calcAppTxHash(tx);
    
    return {
      rawTx,
      txHash
    };

  } catch (error) {
    console.error('Error building upgrade transaction:', error);
    throw error;
  }
}

export async function sendCkbTransaction(tx: Transaction) {
  try {
    const txHash = await cccClient.sendTransaction(tx);
    return txHash;
  } catch (error) {
    console.error('Error sending transaction:', error);
    throw error;
  }
}
