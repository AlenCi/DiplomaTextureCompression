export class DDSWebHandler {
    static downloadDDS(compressedData, width, height, filename) {
        // DDS constants
        const DDS_MAGIC = 0x20534444;
        const DDSD_CAPS = 0x1;
        const DDSD_HEIGHT = 0x2;
        const DDSD_WIDTH = 0x4;
        const DDSD_PIXELFORMAT = 0x1000;
        const DDSD_LINEARSIZE = 0x80000;
        const DDPF_FOURCC = 0x4;
        const FOURCC_DXT1 = 0x31545844;
        const DDSCAPS_TEXTURE = 0x1000;

        const headerSize = 128;
        const dataSize = compressedData.byteLength;
        const totalSize = headerSize + dataSize;
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Write header
        view.setUint32(offset, DDS_MAGIC, true); offset += 4;
        view.setUint32(offset, 124, true); offset += 4;
        
        const flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE;
        view.setUint32(offset, flags, true); offset += 4;
        
        view.setUint32(offset, height, true); offset += 4;
        view.setUint32(offset, width, true); offset += 4;
        view.setUint32(offset, Math.max(1, Math.floor((width + 3) / 4) * 8), true); offset += 4;
        
        // depth, mipmapcount
        offset += 8;
        
        // reserved1[11]
        offset += 44;
        
        // pixel format
        view.setUint32(offset, 32, true); offset += 4;
        view.setUint32(offset, DDPF_FOURCC, true); offset += 4;
        view.setUint32(offset, FOURCC_DXT1, true); offset += 4;
        
        // RGB bit count and masks
        offset += 20;
        
        // caps
        view.setUint32(offset, DDSCAPS_TEXTURE, true); offset += 4;
        
        // caps2, caps3, caps4, reserved2
        offset += 16;

        // Copy compressed data
        new Uint8Array(buffer, headerSize).set(new Uint8Array(compressedData.buffer));

        // Create and trigger download
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
}