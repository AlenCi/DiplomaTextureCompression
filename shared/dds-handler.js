// shared/dds-handler.js

const DDS_MAGIC = 0x20534444;
const DDSD_CAPS = 0x1;
const DDSD_HEIGHT = 0x2;
const DDSD_WIDTH = 0x4;
const DDSD_PITCH = 0x8;
const DDSD_PIXELFORMAT = 0x1000;
const DDSD_MIPMAPCOUNT = 0x20000;
const DDSD_LINEARSIZE = 0x80000;
const DDPF_FOURCC = 0x4;
const FOURCC_DXT1 = 0x31545844; // "DXT1" in ASCII
const DDSCAPS_TEXTURE = 0x1000;

export class DDSHandler {
    static createDDSBuffer(width, height, compressedData) {
        const headerSize = 128;
        const dataSize = compressedData.byteLength;
        const totalSize = headerSize + dataSize;
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Magic number "DDS "
        view.setUint32(offset, DDS_MAGIC, true); offset += 4;
        
        // DDS_HEADER size
        view.setUint32(offset, 124, true); offset += 4;
        
        // flags: Indicate which fields are valid
        const flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE;
        view.setUint32(offset, flags, true); offset += 4;
        
        // height
        view.setUint32(offset, height, true); offset += 4;
        
        // width
        view.setUint32(offset, width, true); offset += 4;
        
        // pitchOrLinearSize: For compressed textures, this is the total number of bytes
        const blockSize = 8; // DXT1 uses 8 bytes per 4x4 block
        const linearSize = Math.floor((width + 3) / 4) * Math.floor((height + 3) / 4) * blockSize;
        view.setUint32(offset, linearSize, true); offset += 4;
        
        // depth (unused)
        view.setUint32(offset, 0, true); offset += 4;
        
        // mipMapCount (unused)
        view.setUint32(offset, 0, true); offset += 4;
        
        // reserved1[11]
        for (let i = 0; i < 11; i++) {
            view.setUint32(offset, 0, true); offset += 4;
        }
        
        // DDS_PIXELFORMAT
        view.setUint32(offset, 32, true); offset += 4; // size of pixel format struct
        view.setUint32(offset, DDPF_FOURCC, true); offset += 4; // flags
        view.setUint32(offset, FOURCC_DXT1, true); offset += 4; // fourCC
        view.setUint32(offset, 0, true); offset += 4; // RGBBitCount
        view.setUint32(offset, 0, true); offset += 4; // RBitMask
        view.setUint32(offset, 0, true); offset += 4; // GBitMask
        view.setUint32(offset, 0, true); offset += 4; // BBitMask
        view.setUint32(offset, 0, true); offset += 4; // ABitMask
        
        // caps
        view.setUint32(offset, DDSCAPS_TEXTURE, true); offset += 4;
        
        // caps2, caps3, caps4
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        
        // reserved2
        view.setUint32(offset, 0, true); offset += 4;

        // Copy compressed data
        new Uint8Array(buffer, headerSize).set(new Uint8Array(compressedData.buffer));

        return buffer;
    }

    static parseDDSBuffer(buffer) {
        const view = new DataView(buffer);
        let offset = 0;

        // Verify magic number
        const magic = view.getUint32(offset, true);
        if (magic !== DDS_MAGIC) {
            throw new Error('Not a valid DDS file');
        }
        offset += 4;

        // Skip header size
        offset += 4;

        // Get flags
        const flags = view.getUint32(offset, true);
        offset += 4;

        // Get dimensions
        const height = view.getUint32(offset, true);
        offset += 4;
        const width = view.getUint32(offset, true);
        offset += 4;

        // Skip to pixel format
        offset = 76;

        // Check format (must be DXT1)
        const pfFlags = view.getUint32(offset + 4, true);
        const fourCC = view.getUint32(offset + 8, true);

        if (!(pfFlags & DDPF_FOURCC) || fourCC !== FOURCC_DXT1) {
            throw new Error('Unsupported format - must be DXT1');
        }

        // Get compressed data
        const dataOffset = 128;
        const compressedData = new Uint32Array(buffer.slice(dataOffset));

        return {
            width,
            height,
            compressedData
        };
    }

    // Browser-specific methods
    static downloadDDS(compressedData, width, height, filename) {
        const buffer = this.createDDSBuffer(width, height, compressedData);
        
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static async loadDDS(file) {
        const buffer = await file.arrayBuffer();
        return this.parseDDSBuffer(buffer);
    }

    // CLI/Deno-specific methods
    static async writeDDS(path, width, height, compressedData) {
        if (typeof Deno === 'undefined') {
            throw new Error('Deno environment required for file system operations');
        }

        const buffer = this.createDDSBuffer(width, height, compressedData);
        await Deno.writeFile(path, new Uint8Array(buffer));
    }

    static async readDDS(path) {
        if (typeof Deno === 'undefined') {
            throw new Error('Deno environment required for file system operations');
        }

        const fileData = await Deno.readFile(path);
        return this.parseDDSBuffer(fileData.buffer);
    }
}