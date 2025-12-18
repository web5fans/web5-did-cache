import { Address, ccc, CellDepLike, hexFrom, KnownScript, Transaction, hashTypeId, HasherCkb } from "@ckb-ccc/core";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base32 } from "@scure/base";
import { createPlatformAddress, getAllPlatformAddress } from "../models/platformAddress";
import dotenv from 'dotenv';
import { DidCkbData } from '../utils/didMol';

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
  
  // Calculate TypeID. DID cell will be output 0.
  const typeId = hashTypeId(cellInput, 0);
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

    // Get platform cell
    let platformCell;
    for await (const cell of platformSigner.findCells({
      scriptLenRange: [0, 1],
      outputDataLenRange: [0, 1],
    }, false, "asc", 1)) {
      platformCell = cell;
      break;
    }
    
    if (!platformCell) {
      throw new Error('Platform cell not found');
    }

    // Prepare inputs
    // Input 0: Platform cell
    const inputs = [{
      previousOutput: platformCell.outPoint,
      since: "0x0",
    }];

    // Calculate needed capacity
    // Output 0: DID Cell (TypeID + Data(metadata) + Lock(sender))
    // Output 1: Platform Cell (61 CKB)
    // Output 2: Change (Sender)
    
    // We need to estimate DID cell capacity.
    // Capacity = 8 + Lock + Type + Data
    // Lock = Sender Lock (assume standard secp256k1 = 53 bytes? Script is 32 codehash + 1 hashtype + 20 args = 53)
    // Type = DIDType (32 codehash + 1 hashtype + 32 args = 65)
    // Data = data length
    
    // prepare output[0] -- did cell
    const didArgs = hashTypeId(inputs[0], 0);
    const didCodeHash = CKB_NETWORK === 'ckb_testnet' ? '0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5' : '0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a';

    const didTypeScript = {
        codeHash: didCodeHash,
        hashType: 'type',
        args: didArgs
    };

    // calculate new did data
    const metadataJson = JSON.parse(metadata);
    // Dynamic import for ESM module
    const cbor = await import('@ipld/dag-cbor');
    const cborBytes = cbor.encode(metadataJson);
    const docHex = ccc.hexFrom(cborBytes);
    const newDid = DidCkbData.from({ value: { document: docHex, localId: undefined } });
    const didData = newDid.toBytes();
    const didDataHex = ccc.hexFrom(didData);

    // Calculate occupied capacity
    // 8 (cap) + lock_len + type_len + data_len
    const dataLen = didData.length;
    const lockLen = senderAddr.script.toBytes().length;
    const typeLen = 33 + 32; // codeHash(32) + hashType(1) + args(32)
    const didCapacity = BigInt(8 + lockLen + typeLen + dataLen) * BigInt(100000000);
    
    const platformCapacity = MIN_AMOUNT;
    const fee = TRANSFER_FEE;
    
    const totalNeeded = didCapacity + fee; // Platform cell covers itself.
    
    // Find sender cells
    let sendSum = BigInt(0);
    const senderCells = [];
    for await (const cell of senderSigner.findCells(
      {
        scriptLenRange: [0, 1],
        outputDataLenRange: [0, 1],
      }, false, "asc", 10
    )) {
      sendSum += BigInt(cell.cellOutput.capacity);
      senderCells.push(cell);
      if (sendSum >= totalNeeded + BigInt(8 + lockLen) * BigInt(100000000) || sendSum == totalNeeded) {
        break;
      }
    }

    if (sendSum < totalNeeded || sendSum < totalNeeded + BigInt(8 + lockLen) * BigInt(100000000)) {
      throw new Error(`Sender does not have enough balance. Needed: ${totalNeeded}, Has: ${sendSum}`);
    }
    
    // Add sender cells to inputs
    for (const cell of senderCells) {
        inputs.push({
            previousOutput: cell.outPoint,
            since: "0x0"
        });
    }

    const outputs = [
      {
        capacity: ccc.numToHex(didCapacity),
        lock: senderAddr.script,
        type: didTypeScript
      },
      {
        capacity: ccc.numToHex(platformCapacity),
        lock: platformAddr.script,
      }
    ];

    const outputsData = [
      didDataHex,
      "0x"
    ];

    // if need change cell, add it
    if (sendSum > totalNeeded) {
      outputs.push({
        capacity: ccc.numToHex(sendSum - totalNeeded), // Change
        lock: senderAddr.script,
      });
      outputsData.push("0x");
    }

    const tx = Transaction.from({
      version: 0,
      cellDeps: [],
      inputs: inputs,
      outputs: outputs,
      outputsData: outputsData,
    });

    // Add cell deps
    // Platform Lock (secp256k1)
    // sender lock cell deps add by user
    const knownScripts: KnownScript[] = [KnownScript.Secp256k1Blake160];
    tx.addCellDepsOfKnownScripts(cccClient, ...knownScripts);

    // Prepare witnesses
    // Input 0 is platform, Input 1..N are sender.
    // We need witnesses for all.
    // Platform signs Input 0.
    // Sender signs Input 1..N.
    
    // However, usually we put one witness per lock.
    // But here we have mixed locks.
    // Input 0: Lock A
    // Input 1: Lock B
    
    // CCC `prepareSighashAllWitness` helps.
    // It finds inputs locked by the script and sets up witnesses.
    
    await tx.prepareSighashAllWitness(platformAddr.script, 85, cccClient);
    await tx.prepareSighashAllWitness(senderAddr.script, 85, cccClient);

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
