import { PoolClient } from 'pg';
import { withTransaction, query } from '../db';
import * as PlatformAddressModel from '../models/platformAddress';
import * as DidModel from '../models/did';
import * as CkbService from './ckbService';
import { completeTransaction, getTransactionStatus } from './ckbService';
import { Transaction } from '@ckb-ccc/core';
import { getDidKeyFromPublicHex } from '../utils/didKey';

export async function createDid(metadata: string, secret: string) {
  return await withTransaction(async (client) => {
    // Get available platform address
    const platformAddressInfo = await PlatformAddressModel.getAvailablePlatformAddressWithTransaction(client);
    if (!platformAddressInfo) {
      throw new Error('No available platform address');
    }

    // Calculate DID
    const didString = await CkbService.calculateDid(platformAddressInfo.index);

    // Create DID record
    const didRecord = await DidModel.createDid(
      platformAddressInfo.index,
      didString,
      metadata,
      secret
    );

    return didRecord;
  });
}

// Verify secret
// TODO: more secure verification, for example, secret is phone number or email, verify them with verification code
// For now, just compare the secret in the database
async function realVerifySecret(secret: string): Promise<boolean> {
  return true;
}

export async function updateDid(did: string, secret: string, metadata: string) {
  // Verify secret
  if (!await realVerifySecret(secret)) {
    throw new Error('Secret verification failed');
  }

  const updatedDid = await DidModel.updateDidMetadataInPrepare(did, secret, metadata);
  
  if (!updatedDid) {
    // Check why it failed to provide better error message
    const didRecord = await DidModel.getDidByDid(did);
    if (!didRecord) {
      throw new Error('DID not found');
    }
    if (didRecord.status !== DidModel.DidStatus.PREPARE) {
      throw new Error('DID status is not prepare');
    }
    if (didRecord.secret !== secret) {
      throw new Error('Secret mismatch');
    }
    // Should not happen if above checks pass but update returned null
    throw new Error('Update failed');
  }

  return updatedDid;
}

function verifySignature(sender: string, signature: string, didKey: string): boolean {
  const secp256k1 = require('secp256k1');
  const message = Buffer.from(sender);
  const signatureBuffer = Buffer.from(signature);
  const publicKey = secp256k1.recover(message, signatureBuffer, 0);
  if (!publicKey) {
    return false;
  }
  const recoveredDidKey = getDidKeyFromPublicHex(publicKey.toString('hex'));
  return recoveredDidKey === didKey;
}

export async function upgradeDid(did: string, sender: string, signature: string) {
  const didRecord = await DidModel.getDidByDid(did);
  if (!didRecord) {
    throw new Error('DID not found');
  }
  if (didRecord.status !== DidModel.DidStatus.PREPARE) {
    throw new Error('DID status is not prepare');
  }

  // Verify signature
  const metadataObj = JSON.parse(didRecord.metadata);
  if (!metadataObj.verificationMethods || !metadataObj.verificationMethods.atproto) {
    throw new Error('atproto verification method not found in metadata');
  }
  if (!verifySignature(sender, signature, metadataObj.verificationMethods.atproto)) {
    throw new Error('Signature verification failed');
  }

  const didRecordInUpgrade = await DidModel.changeDidStatusFromPrepareToUpgrade(did)
  if (!didRecordInUpgrade) {
    throw new Error('DID not found or status is not prepare');
  }

  try {
      // Build upgrade transaction
      const { rawTx, txHash } = await CkbService.buildUpgradeTransaction(
        didRecordInUpgrade.platform_address_index,
        sender,
        didRecordInUpgrade.metadata
      );
      
      // Update with real txHash
      await DidModel.updateDidRecordInUpgrade(did, sender, signature, txHash);
      
      return {
        id: didRecordInUpgrade.id,
        did: didRecordInUpgrade.did,
        tx: rawTx
      };
  } catch (error) {
      // Rollback status to PREPARE if build fails
      await DidModel.changeDidStatusFromUpgradeToPrepare(did);
      throw error;
  }
}

export async function completeDid(did: string, partSignedTx: string) {
  const didRecord = await DidModel.getDidByDid(did);
  if (!didRecord) {
    throw new Error('DID not found');
  }
  if (didRecord.status !== DidModel.DidStatus.UPGRADE) {
    throw new Error('DID status is not upgrade');
  }

  const partSignedTxObj = Transaction.from(JSON.parse(partSignedTx));
  if (!partSignedTxObj) {
    throw new Error('Invalid part signed transaction');
  }

  const appTxHash = CkbService.calcAppTxHash(partSignedTxObj);
  if (!appTxHash) {
    throw new Error('Invalid part signed transaction');
  }

  if (appTxHash !== didRecord.tx_hash) {
    throw new Error('transaction hash mismatch');
  }

  const didRecordInPending = await DidModel.changeDidStatusFromUpgradeToPending(did);
  if (!didRecordInPending) {
    throw new Error('DID not found or status is not upgrade');
  }

  try {
      // Sign and send transaction
      const txHash = await completeTransaction(didRecordInPending.platform_address_index, partSignedTx);

      // Update status to pending
      await DidModel.updateDidTxHashInPending(did, txHash);
      return {
        id: didRecordInPending.id,
        did: didRecordInPending.did,
        txHash: txHash
      };
  } catch (error) {
      // Rollback status to PREPARE if complete fails
      await DidModel.changeDidStatusFromPendingToPrepare(did);
      throw error;
  }
}

export async function getDidById(id: number) {
  return await DidModel.getDidById(id);
}

export async function getDid(did: string) {
  return await DidModel.getDidByDid(did);
}

export async function getAllDids() {
    return await DidModel.getAllDids();
}

export async function checkUpgradeDids() {
    const upgradeDids = await DidModel.getUpgradeDidsTimeout(60);
    for (const didRecord of upgradeDids) {
        try {
            await DidModel.changeDidStatusFromUpgradeToPrepare(didRecord.did);
            console.log(`DID ${didRecord.did} timeout in upgrade status. Status reset to prepare.`);
        } catch (e) {
            console.error(`Error resetting timeout DID ${didRecord.did}:`, e);
        }
    }
}

export async function checkPendingDids() {
    const pendingDids = await DidModel.getPendingDids();
    for (const didRecord of pendingDids) {
        if (!didRecord.tx_hash) continue;
        try {
            const status = await getTransactionStatus(didRecord.tx_hash);
            if (status === 'committed') {
                await withTransaction(async (client) => {
                    // Update status to complete
                    await DidModel.updateDidStatusToComplete(didRecord.did);
                    
                    // Release platform address
                    await PlatformAddressModel.releasePlatformAddressWithTransaction(client, didRecord.platform_address_index);
                });
                console.log(`DID ${didRecord.did} completed.`);
            } else if (status === 'rejected' || status === 'unknown') {
                await DidModel.changeDidStatusFromPendingToPrepare(didRecord.did);
                console.log(`DID ${didRecord.did} failed. Status reset to prepare.`);
            } else {
                console.log(`DID ${didRecord.did} status: ${status}`);
            }
        } catch (e) {
            console.error(`Error checking DID ${didRecord.did}:`, e);
        }
    }
}

