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
   * Derive Triple-DES key from password using Photoshop's PBKDF2 scheme.
   * Spec (Adobe Generator / photoshop-connection):
   *   key = PBKDF2-HMAC-SHA256(password, salt="Adobe Photoshop", iter=1000, len=24)
   */
  // Verified against Adobe generator-core / ps_crypto.js:
  //   PBKDF2-SHA1, salt="Adobe Photoshop", 1000 iter, 24-byte key
  //   DES-EDE3-CBC, fixed IV 000000005d260000
  private static readonly PS_IV = Buffer.from('000000005d260000', 'hex');

  private deriveKey(password: string): Buffer {
    return crypto.pbkdf2Sync(password, 'Adobe Photoshop', 1000, 24, 'sha1');
  }

  private encrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) throw new Error('Not connected');
    const cipher = crypto.createCipheriv('des-ede3-cbc', this.encryptionKey, PhotoshopClient.PS_IV);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  private decrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) throw new Error('Not connected');
    const decipher = crypto.createDecipheriv('des-ede3-cbc', this.encryptionKey, PhotoshopClient.PS_IV);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Photoshop wire format (per Adobe Generator / photoshop-connection):
   *   [length 4B BE] [communication_status 4B BE PLAIN] [encrypted_inner...]
   *   length = 4 (status) + encrypted_inner.length
   *   encrypted_inner (after decrypt) = [protocol 4B][transactionId 4B][contentType 4B][body...]
   *   contentType: 1 = ECMAScript, 2 = ImagePixmap, 3 = ImageJPEG, 4 = ProfileError, 5 = Profile
   */
  private buildMessage(txId: number, contentType: number, body: string): Buffer {
    const bodyBuf = Buffer.from(body, 'utf8');
    const inner = Buffer.alloc(12 + bodyBuf.length);
    inner.writeInt32BE(1, 0);          // protocol version
    inner.writeInt32BE(txId, 4);       // transaction id
    inner.writeInt32BE(contentType, 8);
    bodyBuf.copy(inner, 12);

    const encrypted = this.encrypt(inner);

    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(4 + encrypted.length, 0); // length includes status field
    const statusField = Buffer.alloc(4);
    statusField.writeInt32BE(0, 0); // 0 = no error

    return Buffer.concat([lengthPrefix, statusField, encrypted]);
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
    while (this.receiveBuffer.length >= 8) {
      const msgLength = this.receiveBuffer.readInt32BE(0);
      if (this.receiveBuffer.length < 4 + msgLength) break; // wait for full frame

      const status = this.receiveBuffer.readInt32BE(4);
      const encrypted = this.receiveBuffer.subarray(8, 4 + msgLength);
      this.receiveBuffer = this.receiveBuffer.subarray(4 + msgLength);

      try {
        const decrypted = this.decrypt(encrypted);
        if (decrypted.length < 12) continue;

        const _protocol = decrypted.readInt32BE(0);
        const txId = decrypted.readInt32BE(4);
        const contentType = decrypted.readInt32BE(8);
        const body = decrypted.subarray(12).toString('utf8');

        console.log(`[PS] frame status=${status} txId=${txId} type=${contentType} bodyLen=${body.length} body=${body.substring(0, 200)}`);

        const cb = this.pendingCallbacks.get(txId);
        if (!cb) continue;

        // Skip empty/keepalive intermediate frames; wait for the real script result
        if (contentType === 6) continue; // KEEPALIVE
        if (contentType === 2 || contentType === 10) {
          // Sometimes PS sends an initial empty body before the real result
          if (body.length === 0) continue;
        }

        this.pendingCallbacks.delete(txId);
        if (status !== 0 || contentType === 1) {
          cb.reject(new Error(`Photoshop error (status=${status}, type=${contentType}): ${body}`));
        } else {
          cb.resolve(body);
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

      const frame = this.buildMessage(txId, 10, jsx); // 10 = JAVASCRIPT_S (reuse engine, returns result)
      this.socket!.write(frame);
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
