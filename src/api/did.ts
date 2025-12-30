import express, { Request, Response } from 'express';
import { createDid, updateDid, upgradeDid, completeDid, getDid, getAllDids, getDidById } from '../services/didService.js';
import { DidStatus } from '../models/did.js';
import { ErrorCode } from './errorCodes.js';

export const didRouter = express.Router();
const WEB5_DID_INDEXER_URL = process.env.WEB5_DID_INDEXER_URL || 'http://localhost:3001';

function validateMetadata(metadata: string): void {
  let metadataObj: any;
  try {
    metadataObj = JSON.parse(metadata);
  } catch (e) {
    throw new Error('Metadata must be a valid JSON string');
  }

  if (typeof metadataObj !== 'object' || metadataObj === null) {
    throw new Error('Metadata must be a JSON object');
  }

  // Validate services
  if (metadataObj.services) {
    if (typeof metadataObj.services !== 'object') {
      throw new Error('services must be an object');
    }
    
    if (metadataObj.services.atproto_pds) {
      const pds = metadataObj.services.atproto_pds;
      if (pds.type !== 'AtprotoPersonalDataServer') {
        throw new Error('atproto_pds type must be AtprotoPersonalDataServer');
      }
      if (!pds.endpoint || typeof pds.endpoint !== 'string') {
        throw new Error('atproto_pds must have a valid endpoint');
      }
      try {
        new URL(pds.endpoint);
      } catch (e) {
        throw new Error('atproto_pds endpoint must be a valid URL');
      }
    }
  }

  // Validate alsoKnownAs
  if (metadataObj.alsoKnownAs) {
    if (!Array.isArray(metadataObj.alsoKnownAs)) {
      throw new Error('alsoKnownAs must be an array');
    }
    for (const item of metadataObj.alsoKnownAs) {
      if (typeof item !== 'string') {
        throw new Error('alsoKnownAs items must be strings');
      }
    }
  }

  // Validate verificationMethods
  if (metadataObj.verificationMethods) {
    if (typeof metadataObj.verificationMethods !== 'object') {
      throw new Error('verificationMethods must be an object');
    }
    if (metadataObj.verificationMethods.atproto) {
        if (typeof metadataObj.verificationMethods.atproto !== 'string') {
            throw new Error('verificationMethods.atproto must be a string');
        }
        const atprotoKey = metadataObj.verificationMethods.atproto;
        if (!atprotoKey.startsWith('did:key:')) {
            throw new Error('verificationMethods.atproto must start with did:key:');
        }
    }
  }
}

// Create DID
didRouter.post('/create', async (req: Request, res: Response) => {
  try {
    console.log('create Request body:', req.body);
    const { metadata, secret } = req.body;
    if (!metadata || typeof metadata !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid metadata', code: ErrorCode.VALIDATION_ERROR });
    }
    if (!secret || typeof secret !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid secret', code: ErrorCode.VALIDATION_ERROR });
    }

    try {
        validateMetadata(metadata);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid metadata';
        return res.status(400).json({ error: message, code: ErrorCode.VALIDATION_ERROR });
    }

    const result = await createDid(metadata, secret);
    res.json({
        id: result.id,
        did: result.did,
        metadata: result.metadata
    });
  } catch (error) {
    console.error('Error in create did endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('No available platform address')) {
        return res.status(503).json({ error: message, code: ErrorCode.NO_PLATFORM_ADDRESS });
    }
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});

// Update DID
didRouter.post('/update', async (req: Request, res: Response) => {
  try {
    const { did, secret, metadata } = req.body;
    if (!did || !secret || !metadata) {
      return res.status(400).json({ error: 'Missing parameters', code: ErrorCode.VALIDATION_ERROR });
    }

    try {
        validateMetadata(metadata);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid metadata';
        return res.status(400).json({ error: message, code: ErrorCode.VALIDATION_ERROR });
    }

    const result = await updateDid(did, secret, metadata);
    if (!result) {
        return res.status(404).json({ error: 'DID not found or update failed', code: ErrorCode.NOT_FOUND });
    }
    res.json({
        id: result.id,
        did: result.did,
        metadata: result.metadata
    });
  } catch (error) {
    console.error('Error in update did endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('DID status is not prepare')) {
        return res.status(409).json({ error: message, code: ErrorCode.STATE_MISMATCH });
    }
    if (message.includes('Secret mismatch')) {
        return res.status(403).json({ error: message, code: ErrorCode.VALIDATION_ERROR });
    }
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});

// Upgrade DID
didRouter.post('/upgrade', async (req: Request, res: Response) => {
  try {
    console.log('upgrade Request body:', req.body);
    const { did, sender, signature } = req.body;
    if (!did || !sender || !signature) {
      return res.status(400).json({ error: 'Missing parameters', code: ErrorCode.VALIDATION_ERROR });
    }

    const result = await upgradeDid(did, sender, signature);
    res.json(result);
  } catch (error) {
    console.error('Error in upgrade did endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Sender does not have enough balance')) {
        return res.status(422).json({ error: message, code: ErrorCode.INSUFFICIENT_BALANCE });
    }
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});

// Complete DID
didRouter.post('/complete', async (req: Request, res: Response) => {
  try {
    console.log('complete Request body:', req.body);
    const { did, tx } = req.body;
    if (!did || !tx) {
      return res.status(400).json({ error: 'Missing parameters', code: ErrorCode.VALIDATION_ERROR });
    }

    const result = await completeDid(did, tx); // completeDid expects stringified tx
    res.json(result);
  } catch (error) {
    console.error('Error in complete did endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});

// get DID by id
didRouter.get('/id/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid ID', code: ErrorCode.VALIDATION_ERROR });
    }

    const didRecord = await getDidById(id);
    
    if (!didRecord) {
        return res.status(404).json({ error: 'DID not found', code: ErrorCode.NOT_FOUND });
    }

    const { secret, signature, ...sanitizedRecord } = didRecord;
    res.json(sanitizedRecord);
  } catch (error) {
    console.error('Error in get did by id endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});

// List all DIDs (Admin)
didRouter.get('/all', async (req: Request, res: Response) => {
  if (process.env.ENABLE_ADMIN_API !== 'true') {
    return res.status(403).json({ error: 'Admin API is disabled', code: ErrorCode.FORBIDDEN });
  }

  try {
    const dids = await getAllDids();
    res.json(dids);
  } catch (error) {
    console.error('Error in list dids endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
});


export const getDidHandler = async (req: Request, res: Response) => {
  try {
    const { did } = req.params;
    const didRecord = await getDid(did);

    // If DID is not found or is complete, redirect to Web5 DID Indexer
    if (!didRecord || didRecord.status === DidStatus.COMPLETE) {
        return res.redirect(302, `${WEB5_DID_INDEXER_URL}/${did}`);
    }

    try {
        const metadataJson = JSON.parse(didRecord.metadata);
        res.json(metadataJson);
    } catch (e) {
        // Fallback if metadata is not valid JSON
        res.send(didRecord.metadata);
    }
  } catch (error) {
    console.error('Error in get did endpoint:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
  }
};
