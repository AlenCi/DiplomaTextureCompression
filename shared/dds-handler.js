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
const FOURCC_DXT1 = 0x31545844;

export class DDSHandler {
    static async writeDDS(path, width, height, compressedData) {
        const headerSize = 128;
        const dataSize = compressedData.byteLength;
        const totalSize = headerSize + dataSize;
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // DDS magic number
        view.setUint32(offset, DDS_MAGIC, true); offset += 4;
        
        // DDS_HEADER size
        view.setUint32(offset, 124, true); offset += 4;
        
        // flags
        const flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE;
        view.setUint32(offset, flags, true); offset += 4;
        
        // height
        view.setUint32(offset, height, true); offset += 4;
        
        // width
        view.setUint32(offset, width, true); offset += 4;
        
        // pitchOrLinearSize (compressed size)
        view.setUint32(offset, dataSize, true); offset += 4;
        
        // depth
        view.setUint32(offset, 0, true); offset += 4;
        
        // mipMapCount
        view.setUint32(offset, 0, true); offset += 4;
        
        // reserved1[11]
        offset += 44;
        
        // pixel format size
        view.setUint32(offset, 32, true); offset += 4;
        
        // pixel format flags
        view.setUint32(offset, DDPF_FOURCC, true); offset += 4;
        
        // fourCC
        view.setUint32(offset, FOURCC_DXT1, true); offset += 4;
        
        // RGB bit count
        view.setUint32(offset, 0, true); offset += 4;
        
        // R mask
        view.setUint32(offset, 0, true); offset += 4;
        
        // G mask
        view.setUint32(offset, 0, true); offset += 4;
        
        // B mask
        view.setUint32(offset, 0, true); offset += 4;
        
        // A mask
        view.setUint32(offset, 0, true); offset += 4;
        
        // caps
        view.setUint32(offset, 0x1000, true); offset += 4;
        
        // caps2
        view.setUint32(offset, 0, true); offset += 4;
        
        // caps3
        view.setUint32(offset, 0, true); offset += 4;
        
        // caps4
        view.setUint32(offset, 0, true); offset += 4;
        
        // reserved2
        view.setUint32(offset, 0, true); offset += 4;

        // Copy compressed data
        new Uint8Array(buffer, headerSize).set(new Uint8Array(compressedData.buffer));

        await Deno.writeFile(path, new Uint8Array(buffer));
    }
}