import net from 'net';
import crypto from 'crypto';

/**
 * Photoshop TCP Remote Connection Client
 *
 * Implements the Photoshop remote connection protocol:
 * - TCP connection to port 49494
 * - Triple-DES (DES-EDE3-ECB) encryption
 * - Message framing: [4 bytes length][encrypted payload]
 * - Payload: [status 4B][protocol 4B][transaction_id 4B][content_type 4B][body]
 */
export class PhotoshopClient {
  private socket: net.Socket | null = null;
  private transactionId = 0;
  private encryptionKey: Buffer | null = null;
  private pendingCallbacks = new Map<number, { resolve: (result: string) => void; reject: (err: Error) => void }>();
  private receiveBuffer = Buffer.alloc(0);
  private connected = false;

  /**
   * Derive Triple-DES key from password
   * PS uses a specific key derivation: password is hashed to produce a 24-byte key
   */
  private deriveKey(password: string): Buffer {
    // Photoshop's key derivation: create 24-byte key from password
    // Uses the password bytes, padding/repeating to fill 24 bytes
    const key = Buffer.alloc(24, 0);
    const passBytes = Buffer.from(password, 'utf8');

    for (let i = 0; i < 24; i++) {
      if (i < passBytes.length) {
        key[i] = passBytes[i];
      } else {
        key[i] = 0;
      }
    }

    return key;
  }

  private encrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) throw new Error('Not connected');

    // Pad data to 8-byte boundary (DES block size)
    const padLength = 8 - (data.length % 8);
    const padded = Buffer.concat([data, Buffer.alloc(padLength, padLength)]);

    const cipher = crypto.createCipheriv('des-ede3', this.encryptionKey, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]);
  }

  private decrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) throw new Error('Not connected');

    const decipher = crypto.createDecipheriv('des-ede3', this.encryptionKey, null);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    // Remove PKCS padding
    const padLength = decrypted[decrypted.length - 1];
    if (padLength > 0 && padLength <= 8) {
      return decrypted.subarray(0, decrypted.length - padLength);
    }
    return decrypted;
  }

  private buildMessage(contentType: number, body: string): Buffer {
    const bodyBuf = Buffer.from(body, 'utf8');
    // Header: status(4) + protocol(4) + transaction_id(4) + content_type(4) = 16 bytes
    const header = Buffer.alloc(16);
    header.writeInt32BE(0, 0);              // status: 0 = no error
    header.writeInt32BE(1, 4);              // protocol version: 1
    header.writeInt32BE(this.transactionId, 8); // transaction ID
    header.writeInt32BE(contentType, 12);   // content type: 1 = JavaScript

    const payload = Buffer.concat([header, bodyBuf]);
    const encrypted = this.encrypt(payload);

    // Length prefix (4 bytes, big-endian)
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(encrypted.length, 0);

    return Buffer.concat([lengthPrefix, encrypted]);
  }

  async connect(host: string, port: number, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.encryptionKey = this.deriveKey(password);
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout. Is Photoshop running with Remote Connections enabled?'));
      }, 10000);

      this.socket.connect(port, host, () => {
        clearTimeout(timeout);
        this.connected = true;
        console.log(`Connected to Photoshop at ${host}:${port}`);
        resolve();
      });

      this.socket.on('data', (chunk) => {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
        this.processReceiveBuffer();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(new Error(`Cannot connect to Photoshop: ${err.message}`));
        }
        console.error('Photoshop connection error:', err.message);
      });

      this.socket.on('close', () => {
        this.connected = false;
        // Reject all pending callbacks
        for (const [, cb] of this.pendingCallbacks) {
          cb.reject(new Error('Connection closed'));
        }
        this.pendingCallbacks.clear();
      });
    });
  }

  private processReceiveBuffer() {
    while (this.receiveBuffer.length >= 4) {
      const msgLength = this.receiveBuffer.readInt32BE(0);
      if (this.receiveBuffer.length < 4 + msgLength) break; // Wait for more data

      const encrypted = this.receiveBuffer.subarray(4, 4 + msgLength);
      this.receiveBuffer = this.receiveBuffer.subarray(4 + msgLength);

      try {
        const decrypted = this.decrypt(encrypted);

        if (decrypted.length < 16) continue;

        const status = decrypted.readInt32BE(0);
        const _protocol = decrypted.readInt32BE(4);
        const txId = decrypted.readInt32BE(8);
        const contentType = decrypted.readInt32BE(12);
        const body = decrypted.subarray(16).toString('utf8');

        const cb = this.pendingCallbacks.get(txId);
        if (cb) {
          this.pendingCallbacks.delete(txId);
          if (status !== 0 || contentType === 4) {
            cb.reject(new Error(`Photoshop error: ${body}`));
          } else {
            cb.resolve(body);
          }
        }
      } catch (err) {
        console.error('Error processing PS response:', err);
      }
    }
  }

  async executeScript(jsx: string, timeoutMs = 30000): Promise<string> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to Photoshop');
    }

    const txId = ++this.transactionId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(txId);
        reject(new Error('Script execution timeout'));
      }, timeoutMs);

      this.pendingCallbacks.set(txId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      // Build and send message with content type 1 (JavaScript)
      const msg = this.buildMessage(1, jsx);

      // Update transaction ID in the already-built message
      // (transaction ID was set before incrementing)
      const headerBuf = Buffer.alloc(16);
      headerBuf.writeInt32BE(0, 0);
      headerBuf.writeInt32BE(1, 4);
      headerBuf.writeInt32BE(txId, 8);
      headerBuf.writeInt32BE(1, 12);

      const bodyBuf = Buffer.from(jsx, 'utf8');
      const payload = Buffer.concat([headerBuf, bodyBuf]);
      const encrypted = this.encrypt(payload);

      const lengthPrefix = Buffer.alloc(4);
      lengthPrefix.writeInt32BE(encrypted.length, 0);

      this.socket!.write(Buffer.concat([lengthPrefix, encrypted]));
    });
  }

  /**
   * Replace Smart Object contents in a PSD template
   */
  async replaceSmartObject(
    psdPath: string,
    layerName: string,
    imagePath: string,
    outputPath: string,
    jpgQuality?: number
  ): Promise<void> {
    // Normalize paths for ExtendScript (use forward slashes)
    const normPsd = psdPath.replace(/\\/g, '/');
    const normImage = imagePath.replace(/\\/g, '/');
    const normOutput = outputPath.replace(/\\/g, '/');

    const isJpg = normOutput.toLowerCase().endsWith('.jpg') || normOutput.toLowerCase().endsWith('.jpeg');
    const quality = jpgQuality ?? 10;

    const jsx = `
      var doc = app.open(new File("${normPsd}"));
      try {
        doc.activeLayer = doc.layers.getByName("${layerName}");

        var desc = new ActionDescriptor();
        var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
        desc.putPath(charIDToTypeID("null"), new File("${normImage}"));
        executeAction(idplacedLayerReplaceContents, desc, DialogModes.NO);

        ${isJpg ? `
        var saveOpts = new JPEGSaveOptions();
        saveOpts.quality = ${quality};
        doc.saveAs(new File("${normOutput}"), saveOpts, true);
        ` : `
        var saveOpts = new PNGSaveOptions();
        saveOpts.compression = 6;
        doc.saveAs(new File("${normOutput}"), saveOpts, true);
        `}

        doc.close(SaveOptions.DONOTSAVECHANGES);
        "OK";
      } catch(e) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        throw e;
      }
    `;

    const result = await this.executeScript(jsx, 60000);
    if (result !== 'OK') {
      throw new Error(`Smart object replacement failed: ${result}`);
    }
  }

  /**
   * Get layer names from a PSD file (for template setup)
   */
  async getLayerNames(psdPath: string): Promise<string[]> {
    const normPsd = psdPath.replace(/\\/g, '/');
    const jsx = `
      var doc = app.open(new File("${normPsd}"));
      var names = [];
      for (var i = 0; i < doc.layers.length; i++) {
        names.push(doc.layers[i].name + " [" + doc.layers[i].kind + "]");
      }
      doc.close(SaveOptions.DONOTSAVECHANGES);
      names.join("\\n");
    `;

    const result = await this.executeScript(jsx);
    return result.split('\n').filter(Boolean);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}
