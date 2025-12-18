import { PoolClient } from 'pg';
import { query } from '../db';

export interface Did {
  id: number;
  platform_address_index: number;
  did: string;
  metadata: string;
  secret: string;
  status: number; // 0: prepare, 1: upgrade, 2: pending, 3: complete
  sender?: string;
  signature?: string;
  tx_hash?: string;
  created_at: Date;
  updated_at: Date;
}

export enum DidStatus {
  PREPARE = 0,
  UPGRADE = 1,
  PENDING = 2,
  COMPLETE = 3,
}

export async function createDid(
  platform_address_index: number,
  did: string,
  metadata: string,
  secret: string
): Promise<Did> {
  const result = await query(
    `INSERT INTO did (platform_address_index, did, metadata, secret, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [platform_address_index, did, metadata, secret, DidStatus.PREPARE]
  );
  return result.rows[0];
}

export async function getDidById(id: number): Promise<Did | null> {
  const result = await query(
    'SELECT * FROM did WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getDidByDid(did: string): Promise<Did | null> {
  const result = await query(
    'SELECT * FROM did WHERE did = $1',
    [did]
  );
  return result.rows[0] || null;
}

export async function updateDidMetadataInPrepare(
  did: string,
  secret: string,
  metadata: string
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET metadata = $3, updated_at = NOW()
     WHERE did = $1 AND secret = $2 AND status = 0
     RETURNING *`,
    [did, secret, metadata]
  );
  return result.rows[0] || null;
}

export async function changeDidStatusFromPrepareToUpgrade(
  did: string,
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2
     WHERE did = $1 AND status = 0
     RETURNING *`,
    [did, DidStatus.UPGRADE]
  );
  return result.rows[0] || null;
}

export async function updateDidRecordInUpgrade(
  did: string,
  sender: string,
  signature: string,
  tx_hash: string
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2, sender = $3, signature = $4, tx_hash = $5, updated_at = NOW()
     WHERE did = $1 AND status = 1
     RETURNING *`,
    [did, DidStatus.UPGRADE, sender, signature, tx_hash]
  );
  return result.rows[0] || null;
}

export async function changeDidStatusFromUpgradeToPrepare(
  did: string,
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2
     WHERE did = $1 AND status = 1
     RETURNING *`,
    [did, DidStatus.PREPARE]
  );
  return result.rows[0] || null;
}

export async function changeDidStatusFromUpgradeToPending(
  did: string,
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2
     WHERE did = $1 AND status = 1
     RETURNING *`,
    [did, DidStatus.PENDING]
  );
  return result.rows[0] || null;
}

export async function updateDidTxHashInPending(
  did: string,
  tx_hash: string
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET tx_hash = $3, updated_at = NOW()
     WHERE did = $1 AND status = 2
     RETURNING *`,
    [did, tx_hash]
  );
  return result.rows[0] || null;
}

export async function changeDidStatusFromPendingToPrepare(
  did: string,
): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2
     WHERE did = $1 AND status = 2
     RETURNING *`,
    [did, DidStatus.PREPARE]
  );
  return result.rows[0] || null;
}

export async function updateDidStatusToComplete(did: string): Promise<Did | null> {
  const result = await query(
    `UPDATE did
     SET status = $2, updated_at = NOW()
     WHERE did = $1
     RETURNING *`,
    [did, DidStatus.COMPLETE]
  );
  return result.rows[0] || null;
}

export async function getAllDids(): Promise<Did[]> {
  const result = await query(
    'SELECT * FROM did ORDER BY id DESC',
    []
  );
  return result.rows || [];
}

export async function getPendingDids(): Promise<Did[]> {
  const result = await query(
    `SELECT * FROM did 
     WHERE status = $1 
     AND updated_at < NOW() - INTERVAL '20 seconds'
     ORDER BY updated_at ASC`,
    [DidStatus.PENDING]
  );
  return result.rows || [];
}

export async function getUpgradeDidsTimeout(seconds: number): Promise<Did[]> {
  const result = await query(
    `SELECT * FROM did 
     WHERE status = $1 
     AND updated_at < NOW() - make_interval(secs := $2)
     ORDER BY updated_at ASC`,
    [DidStatus.UPGRADE, seconds]
  );
  return result.rows || [];
}
