import net from 'net';
import crypto from 'crypto';

type ResizeMode = 'fit' | 'fill' | 'stretch' | 'none';

/**
 * Photoshop TCP Remote Connection Client
 *
 * Implements the Photoshop remote connection protocol:
 * - TCP connection to port 49494
 * - Triple-DES (DES-EDE3-CBC) encryption
 * - Message framing: [length][plain status][encrypted payload]
 */
export class PhotoshopClient {
  private socket: net.Socket | null = null;
  private transactionId = 0;
  private encryptionKey: Buffer | null = null;
  private pendingCallbacks = new Map<number, { resolve: (result: string) => void; reject: (err: Error) => void }>();
  private receiveBuffer = Buffer.alloc(0);
  private connected = false;

  // Verified against Adobe generator-core / ps_crypto.js.
  private static readonly PS_IV = Buffer.from('000000005d260000', 'hex');

  private static asciiStringLiteral(value: string): string {
    let result = '"';
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      switch (code) {
        case 0x08:
          result += '\\b';
          break;
        case 0x09:
          result += '\\t';
          break;
        case 0x0a:
          result += '\\n';
          break;
        case 0x0c:
          result += '\\f';
          break;
        case 0x0d:
          result += '\\r';
          break;
        case 0x22:
          result += '\\"';
          break;
        case 0x5c:
          result += '\\\\';
          break;
        default:
          result += code >= 0x20 && code <= 0x7e
            ? value[i]
            : `\\u${code.toString(16).padStart(4, '0')}`;
      }
    }
    result += '"';
    return result;
  }

  private static pathLiteral(value: string): string {
    return PhotoshopClient.asciiStringLiteral(value.replace(/\\/g, '/'));
  }

  private static stringLiteral(value: string): string {
    return PhotoshopClient.asciiStringLiteral(value);
  }

  private static replacementJsx(resizeModeLiteral: string): string {
    return `
      var __mockupReplacementCache = {};
      var __mockupReplacementFiles = [];

      function clearReplacementCache() {
        for (var i = 0; i < __mockupReplacementFiles.length; i++) {
          try { __mockupReplacementFiles[i].remove(); } catch (removeErr) {}
        }
        __mockupReplacementCache = {};
        __mockupReplacementFiles = [];
      }

      function makeReplacementFile(imgPath, targetW, targetH, resizeMode) {
        var tmpFile = new File(Folder.temp.fsName + "/mockup_" + (new Date()).getTime() + "_" + Math.random().toString(36).substr(2, 5) + ".png");
        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 1;

        var imgDoc = app.open(new File(imgPath));
        try {
          var sourceW = imgDoc.width.as('px');
          var sourceH = imgDoc.height.as('px');

          if (resizeMode === "stretch") {
            imgDoc.resizeImage(new UnitValue(targetW, 'px'), new UnitValue(targetH, 'px'), undefined, ResampleMethod.BICUBICSHARPER);
            imgDoc.saveAs(tmpFile, pngOpts, true);
            imgDoc.close(SaveOptions.DONOTSAVECHANGES);
            return tmpFile;
          }

          if (resizeMode === "fill") {
            var fillScale = Math.max(targetW / sourceW, targetH / sourceH);
            imgDoc.resizeImage(
              new UnitValue(Math.round(sourceW * fillScale), 'px'),
              new UnitValue(Math.round(sourceH * fillScale), 'px'),
              undefined,
              ResampleMethod.BICUBICSHARPER
            );
            var filledW = imgDoc.width.as('px');
            var filledH = imgDoc.height.as('px');
            var cropLeft = Math.round((filledW - targetW) / 2);
            var cropTop = Math.round((filledH - targetH) / 2);
            imgDoc.crop([
              new UnitValue(cropLeft, 'px'),
              new UnitValue(cropTop, 'px'),
              new UnitValue(cropLeft + targetW, 'px'),
              new UnitValue(cropTop + targetH, 'px')
            ]);
            imgDoc.saveAs(tmpFile, pngOpts, true);
            imgDoc.close(SaveOptions.DONOTSAVECHANGES);
            return tmpFile;
          }

          if (resizeMode === "fit") {
            var fitScale = Math.min(targetW / sourceW, targetH / sourceH);
            imgDoc.resizeImage(
              new UnitValue(Math.round(sourceW * fitScale), 'px'),
              new UnitValue(Math.round(sourceH * fitScale), 'px'),
              undefined,
              ResampleMethod.BICUBICSHARPER
            );
          }

          var canvas = app.documents.add(
            new UnitValue(targetW, 'px'),
            new UnitValue(targetH, 'px'),
            72,
            "mockup_replacement",
            NewDocumentMode.RGB,
            DocumentFill.TRANSPARENT
          );

          app.activeDocument = imgDoc;
          imgDoc.selection.selectAll();
          imgDoc.selection.copy();
          imgDoc.close(SaveOptions.DONOTSAVECHANGES);

          app.activeDocument = canvas;
          canvas.paste();
          var pasted = canvas.activeLayer;
          var b = pasted.bounds;
          var pastedW = b[2].as('px') - b[0].as('px');
          var pastedH = b[3].as('px') - b[1].as('px');
          pasted.translate(
            Math.round((targetW - pastedW) / 2 - b[0].as('px')),
            Math.round((targetH - pastedH) / 2 - b[1].as('px'))
          );
          canvas.saveAs(tmpFile, pngOpts, true);
          canvas.close(SaveOptions.DONOTSAVECHANGES);
          return tmpFile;
        } catch (e) {
          try { imgDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
          throw e;
        }
      }

      function fitAndReplaceSO(lyr, imgPath, parentDoc) {
        parentDoc.activeLayer = lyr;
        executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
        var soDoc = app.activeDocument;
        var targetW = soDoc.width.as('px');
        var targetH = soDoc.height.as('px');
        soDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = parentDoc;

        var sizeKey = Math.round(targetW) + "x" + Math.round(targetH);
        var cacheKey = imgPath + "|" + sizeKey + "|" + ${resizeModeLiteral};
        var tmpFile = __mockupReplacementCache[cacheKey];
        if (!tmpFile || !tmpFile.exists) {
          tmpFile = makeReplacementFile(imgPath, targetW, targetH, ${resizeModeLiteral});
          __mockupReplacementCache[cacheKey] = tmpFile;
          __mockupReplacementFiles.push(tmpFile);
        }
        parentDoc.activeLayer = lyr;
        var replaceDesc = new ActionDescriptor();
        replaceDesc.putPath(charIDToTypeID("null"), tmpFile);
        executeAction(stringIDToTypeID("placedLayerReplaceContents"), replaceDesc, DialogModes.NO);
      }
    `;
  }

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

  private buildMessage(txId: number, contentType: number, body: string): Buffer {
    const bodyBuf = Buffer.from(body, 'utf8');
    const inner = Buffer.alloc(12 + bodyBuf.length);
    inner.writeInt32BE(1, 0);
    inner.writeInt32BE(txId, 4);
    inner.writeInt32BE(contentType, 8);
    bodyBuf.copy(inner, 12);

    const encrypted = this.encrypt(inner);
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(4 + encrypted.length, 0);
    const statusField = Buffer.alloc(4);
    statusField.writeInt32BE(0, 0);

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
          return;
        }

        this.connected = false;
        for (const [, cb] of this.pendingCallbacks) {
          cb.reject(new Error(`Photoshop connection lost: ${err.message}`));
        }
        this.pendingCallbacks.clear();
      });

      this.socket.on('close', () => {
        this.connected = false;
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
      if (this.receiveBuffer.length < 4 + msgLength) break;

      const status = this.receiveBuffer.readInt32BE(4);
      const encrypted = this.receiveBuffer.subarray(8, 4 + msgLength);
      this.receiveBuffer = this.receiveBuffer.subarray(4 + msgLength);

      try {
        const decrypted = this.decrypt(encrypted);
        if (decrypted.length < 12) continue;

        const txId = decrypted.readInt32BE(4);
        const contentType = decrypted.readInt32BE(8);
        const body = decrypted.subarray(12).toString('utf8');

        console.log(`[PS] frame status=${status} txId=${txId} type=${contentType} bodyLen=${body.length} body=${body.substring(0, 200)}`);

        const cb = this.pendingCallbacks.get(txId);
        if (!cb) continue;

        if (contentType === 6) continue;
        if ((contentType === 2 || contentType === 10) && body.length === 0) continue;

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

      const frame = this.buildMessage(txId, 10, jsx);
      this.socket!.write(frame);
    });
  }

  async replaceSmartObject(
    psdPath: string,
    layerName: string,
    imagePath: string,
    outputPath: string,
    jpgQuality?: number,
    resizeMode: ResizeMode = 'fill'
  ): Promise<void> {
    const psdLiteral = PhotoshopClient.pathLiteral(psdPath);
    const imageLiteral = PhotoshopClient.pathLiteral(imagePath);
    const outputLiteral = PhotoshopClient.pathLiteral(outputPath);
    const layerLiteral = PhotoshopClient.stringLiteral(layerName);
    const modeLiteral = PhotoshopClient.stringLiteral(resizeMode);
    const isJpg = outputPath.toLowerCase().endsWith('.jpg') || outputPath.toLowerCase().endsWith('.jpeg');
    const quality = jpgQuality ?? 10;

    const jsx = `
      app.displayDialogs = DialogModes.NO;
      ${PhotoshopClient.replacementJsx(modeLiteral)}

      var doc = app.open(new File(${psdLiteral}));
      try {
        var layer = doc.layers.getByName(${layerLiteral});
        fitAndReplaceSO(layer, ${imageLiteral}, doc);
        try { doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, true); } catch (profileErr) {}

        ${isJpg ? `
        var saveOpts = new JPEGSaveOptions();
        saveOpts.quality = ${quality};
        doc.saveAs(new File(${outputLiteral}), saveOpts, true);
        ` : `
        var saveOpts = new PNGSaveOptions();
        saveOpts.compression = 6;
        doc.saveAs(new File(${outputLiteral}), saveOpts, true);
        `}

        doc.close(SaveOptions.DONOTSAVECHANGES);
        clearReplacementCache();
        "OK";
      } catch (e) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
        try { clearReplacementCache(); } catch (cacheErr) {}
        throw e;
      }
    `;

    const result = await this.executeScript(jsx, 60000);
    if (result !== 'OK') {
      throw new Error(`Smart object replacement failed: ${result}`);
    }
  }

  async getLayerNames(psdPath: string): Promise<string[]> {
    const psdLiteral = PhotoshopClient.pathLiteral(psdPath);
    const jsx = `
      var doc = app.open(new File(${psdLiteral}));
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

  async getSmartObjectLayers(psdPath: string): Promise<string[]> {
    const psdLiteral = PhotoshopClient.pathLiteral(psdPath);
    const jsx = `
      var doc = app.open(new File(${psdLiteral}));
      var result = [];
      function walkLayers(layers) {
        for (var i = 0; i < layers.length; i++) {
          var layer = layers[i];
          if (layer.typename === "LayerSet") {
            walkLayers(layer.layers);
          } else if (layer.kind == LayerKind.SMARTOBJECT) {
            result.push(layer.name);
          }
        }
      }
      walkLayers(doc.layers);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      result.join("\\n");
    `;

    const result = await this.executeScript(jsx, 30000);
    return result.split('\n').filter(Boolean);
  }

  async getPsdStructure(psdPath: string): Promise<{ layerComps: string[]; topGroups: string[]; width: number; height: number }> {
    const psdLiteral = PhotoshopClient.pathLiteral(psdPath);
    const jsx = `
      var doc = app.open(new File(${psdLiteral}));
      var comps = [];
      for (var i = 0; i < doc.layerComps.length; i++) {
        comps.push(doc.layerComps[i].name);
      }
      var groups = [];
      for (var j = 0; j < doc.layers.length; j++) {
        if (doc.layers[j].typename === "LayerSet") {
          groups.push(doc.layers[j].name);
        }
      }
      var w = doc.width.as("px");
      var h = doc.height.as("px");
      doc.close(SaveOptions.DONOTSAVECHANGES);
      JSON.stringify({ comps: comps, groups: groups, w: w, h: h });
    `;
    const result = await this.executeScript(jsx, 30000);
    const parsed = JSON.parse(result);
    return { layerComps: parsed.comps, topGroups: parsed.groups, width: parsed.w, height: parsed.h };
  }

  async replaceAndExportScenes(
    psdPath: string,
    imagePath: string,
    outputDir: string,
    exportFormat: 'jpg' | 'png',
    jpgQuality: number,
    resizeMode: ResizeMode = 'fill'
  ): Promise<number> {
    const psdLiteral = PhotoshopClient.pathLiteral(psdPath);
    const imageLiteral = PhotoshopClient.pathLiteral(imagePath);
    const outputLiteral = PhotoshopClient.pathLiteral(outputDir);
    const modeLiteral = PhotoshopClient.stringLiteral(resizeMode);
    const isJpg = exportFormat === 'jpg';
    const quality = jpgQuality ?? 10;

    const jsx = `
      app.displayDialogs = DialogModes.NO;
      ${PhotoshopClient.replacementJsx(modeLiteral)}

      var doc = app.open(new File(${psdLiteral}));
      try {
        function layerArea(layer) {
          try {
            var b = layer.bounds;
            var w = b[2].as('px') - b[0].as('px');
            var h = b[3].as('px') - b[1].as('px');
            if (w <= 0 || h <= 0) return 0;
            return w * h;
          } catch (e) {
            return 0;
          }
        }

        function looksLikeSceneBase(layer) {
          var name = String(layer.name).replace(/^\\s+|\\s+$/g, "");
          if (/^(\\d+|COOQ\\d*)$/i.test(name)) return true;

          try {
            var b = layer.bounds;
            var left = b[0].as('px');
            var top = b[1].as('px');
            var width = b[2].as('px') - left;
            var height = b[3].as('px') - top;
            var docW = doc.width.as('px');
            var docH = doc.height.as('px');
            var tileCount = docH > docW * 1.5 ? Math.max(1, Math.round(docH / docW)) : 1;
            var tileH = docH / tileCount;
            var topTile = Math.round(top / tileH) * tileH;
            var tolerance = Math.max(12, docW * 0.035);

            return Math.abs(width - docW) <= tolerance
              && Math.abs(height - tileH) <= tolerance
              && Math.abs(left) <= tolerance
              && Math.abs(top - topTile) <= tolerance;
          } catch (e) {
            return false;
          }
        }

        function collectSmartObjects(layers, visibleOnly, parentVisible, out) {
          for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var isVisible = parentVisible && layer.visible;
            if (layer.typename === "LayerSet") {
              collectSmartObjects(layer.layers, visibleOnly, isVisible, out);
            } else if ((!visibleOnly || isVisible) && layer.kind == LayerKind.SMARTOBJECT) {
              out.push(layer);
            }
          }
        }

        function chooseTargetSOs(candidates) {
          if (candidates.length <= 1) return candidates;

          var nonBase = [];
          for (var baseIndex = 0; baseIndex < candidates.length; baseIndex++) {
            if (!looksLikeSceneBase(candidates[baseIndex])) nonBase.push(candidates[baseIndex]);
          }
          if (nonBase.length > 0) candidates = nonBase;

          var preferred = [];
          var namePattern = /(replace|design|artwork|pattern|print|mockup|image|photo|smart|\\u66ff\\u6362|\\u56fe\\u6848|\\u8d34\\u56fe|\\u667a\\u80fd|\\u753b\\u9762|\\u82b1\\u578b)/i;
          for (var i = 0; i < candidates.length; i++) {
            if (namePattern.test(candidates[i].name)) preferred.push(candidates[i]);
          }
          var source = preferred.length > 0 ? preferred : candidates;

          var maxArea = 0;
          for (var j = 0; j < source.length; j++) {
            var area = layerArea(source[j]);
            if (area > maxArea) maxArea = area;
          }

          var docArea = doc.width.as('px') * doc.height.as('px');
          var threshold = Math.max(maxArea * 0.08, docArea * 0.001);
          var selected = [];
          for (var k = 0; k < source.length; k++) {
            if (layerArea(source[k]) >= threshold) selected.push(source[k]);
          }

          if (selected.length > 0) return selected;

          var largest = source[0];
          var largestArea = layerArea(largest);
          for (var m = 1; m < source.length; m++) {
            var nextArea = layerArea(source[m]);
            if (nextArea > largestArea) {
              largest = source[m];
              largestArea = nextArea;
            }
          }
          return [largest];
        }

        function unionBounds(layers) {
          var result = null;
          for (var i = 0; i < layers.length; i++) {
            try {
              var b = layers[i].bounds;
              var item = {
                left: b[0].as('px'),
                top: b[1].as('px'),
                right: b[2].as('px'),
                bottom: b[3].as('px')
              };
              if (item.right <= item.left || item.bottom <= item.top) continue;
              if (!result) {
                result = item;
              } else {
                result.left = Math.min(result.left, item.left);
                result.top = Math.min(result.top, item.top);
                result.right = Math.max(result.right, item.right);
                result.bottom = Math.max(result.bottom, item.bottom);
              }
            } catch (e) {}
          }
          return result;
        }

        function replaceTargets(targets, imgPath) {
          if (targets.length === 0) throw new Error("No smart object found in scene");
          for (var i = 0; i < targets.length; i++) {
            fitAndReplaceSO(targets[i], imgPath, doc);
          }
          return unionBounds(targets);
        }

        function replaceSceneSmartObjects(imgPath) {
          var visibleSOs = [];
          collectSmartObjects(doc.layers, true, true, visibleSOs);
          if (visibleSOs.length === 0) {
            collectSmartObjects(doc.layers, false, true, visibleSOs);
          }
          var targets = chooseTargetSOs(visibleSOs);
          return replaceTargets(targets, imgPath);
        }

        function cropTallScene(sceneBounds, fallbackIndex) {
          var docW = doc.width.as('px');
          var docH = doc.height.as('px');
          if (docH <= docW * 1.5) return;

          var tileCount = Math.max(1, Math.round(docH / docW));
          var tileH = docH / tileCount;
          var centerY = sceneBounds
            ? (sceneBounds.top + sceneBounds.bottom) / 2
            : (fallbackIndex + 0.5) * tileH;
          var tileIndex = Math.floor(centerY / tileH);
          if (tileIndex < 0) tileIndex = 0;
          if (tileIndex >= tileCount) tileIndex = tileCount - 1;

          var top = Math.round(tileIndex * tileH);
          var bottom = Math.round((tileIndex + 1) * tileH);
          doc.crop([
            new UnitValue(0, 'px'),
            new UnitValue(top, 'px'),
            new UnitValue(docW, 'px'),
            new UnitValue(bottom, 'px')
          ]);
        }

        function saveScene(outPath, sceneBounds, fallbackIndex) {
          cropTallScene(sceneBounds, fallbackIndex);
          ${isJpg ? `
          var opts = new JPEGSaveOptions();
          opts.quality = ${quality};
          ` : `
          var opts = new PNGSaveOptions();
          opts.compression = 6;
          `}
          doc.saveAs(new File(outPath), opts, true);
        }

        var outFolder = new Folder(${outputLiteral});
        if (!outFolder.exists) outFolder.create();

        var initialState = doc.activeHistoryState;
        var count = 0;
        var docW = doc.width.as('px');
        var docH = doc.height.as('px');

        if (doc.layerComps.length > 0) {
          for (var c = 0; c < doc.layerComps.length; c++) {
            doc.activeHistoryState = initialState;
            doc.layerComps[c].apply();
            var compBounds = replaceSceneSmartObjects(${imageLiteral});
            var outputIndex = c + 1;
            if (docH > docW * 1.5 && compBounds) {
              var tileCountForComp = Math.max(1, Math.round(docH / docW));
              var tileHForComp = docH / tileCountForComp;
              var centerYForComp = (compBounds.top + compBounds.bottom) / 2;
              outputIndex = Math.floor(centerYForComp / tileHForComp) + 1;
              if (outputIndex < 1) outputIndex = 1;
              if (outputIndex > tileCountForComp) outputIndex = tileCountForComp;
            }
            count++;
            saveScene(${outputLiteral} + "/" + outputIndex + ".${exportFormat}", compBounds, c);
          }
        } else {
          var groupIndices = [];
          for (var g = 0; g < doc.layers.length; g++) {
            if (doc.layers[g].typename === "LayerSet") groupIndices.push(g);
          }

          if (groupIndices.length > 0) {
            for (var gi = 0; gi < groupIndices.length; gi++) {
              doc.activeHistoryState = initialState;
              for (var li = 0; li < doc.layers.length; li++) {
                if (doc.layers[li].typename === "LayerSet") {
                  doc.layers[li].visible = li === groupIndices[gi];
                }
              }
              var groupBounds = replaceSceneSmartObjects(${imageLiteral});
              count++;
              var groupOutputIndex = count;
              if (docH > docW * 1.5 && groupBounds) {
                var tileCountForGroup = Math.max(1, Math.round(docH / docW));
                var tileHForGroup = docH / tileCountForGroup;
                var centerYForGroup = (groupBounds.top + groupBounds.bottom) / 2;
                groupOutputIndex = Math.floor(centerYForGroup / tileHForGroup) + 1;
                if (groupOutputIndex < 1) groupOutputIndex = 1;
                if (groupOutputIndex > tileCountForGroup) groupOutputIndex = tileCountForGroup;
              }
              saveScene(${outputLiteral} + "/" + groupOutputIndex + ".${exportFormat}", groupBounds, gi);
            }
          } else {
            var sceneBounds = replaceSceneSmartObjects(${imageLiteral});
            count = 1;
            saveScene(${outputLiteral} + "/1.${exportFormat}", sceneBounds, 0);
          }
        }

        doc.close(SaveOptions.DONOTSAVECHANGES);
        clearReplacementCache();
        count.toString();
      } catch (e) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
        try { clearReplacementCache(); } catch (cacheErr) {}
        throw e;
      }
    `;

    const result = await this.executeScript(jsx, 120000);
    return parseInt(result) || 0;
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}
