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
const DDSCAPS_TEXTURE = 0x1000;

export class DDSHandler {
    static logHeaderOffsets(message, offset) {
        console.log(`${message} at offset: ${offset}`);
    }

    static async writeDDS(path, width, height, compressedData) {
        console.log("Writing DDS file...");
        
        const headerSize = 128;
        const dataSize = compressedData.byteLength;
        const totalSize = headerSize + dataSize;
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // DDS magic number
        this.logHeaderOffsets("Writing magic", offset);
        view.setUint32(offset, DDS_MAGIC, true); 
        offset += 4;
        
        // DDS_HEADER size
        this.logHeaderOffsets("Writing header size", offset);
        view.setUint32(offset, 124, true); 
        offset += 4;
        
        // flags
        const flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE;
        this.logHeaderOffsets("Writing flags", offset);
        view.setUint32(offset, flags, true); 
        offset += 4;
        
        // height
        this.logHeaderOffsets("Writing height", offset);
        view.setUint32(offset, height, true); 
        offset += 4;
        
        // width
        this.logHeaderOffsets("Writing width", offset);
        view.setUint32(offset, width, true); 
        offset += 4;
        
        // pitchOrLinearSize
        this.logHeaderOffsets("Writing linear size", offset);
        view.setUint32(offset, Math.max(1, Math.floor((width + 3) / 4) * 8), true);
        offset += 4;
        
        // depth
        offset += 4;
        
        // mipMapCount
        offset += 4;
        
        // reserved1[11]
        offset += 44;
        
        // PIXELFORMAT structure starts here
        this.logHeaderOffsets("Starting PIXELFORMAT at", offset);
        
        // dwSize
        view.setUint32(offset, 32, true); 
        offset += 4;
        
        // dwFlags
        this.logHeaderOffsets("Writing pixel format flags", offset);
        view.setUint32(offset, DDPF_FOURCC, true); 
        offset += 4;
        
        // dwFourCC
        this.logHeaderOffsets("Writing FourCC", offset);
        view.setUint32(offset, FOURCC_DXT1, true); 
        offset += 4;

        // Rest of PIXELFORMAT structure
        offset += 20;
        
        // caps
        view.setUint32(offset, DDSCAPS_TEXTURE, true); 
        offset += 4;
        
        // caps2, caps3, caps4, reserved2
        offset += 16;

        console.log("Header offsets complete at:", offset);
        console.log("Writing compressed data of size:", compressedData.byteLength);

        // Copy compressed data
        new Uint8Array(buffer, headerSize).set(new Uint8Array(compressedData.buffer));

        await Deno.writeFile(path, new Uint8Array(buffer));
        
        // Verify what we wrote
        const verifyBuffer = await Deno.readFile(path);
        const verifyView = new DataView(verifyBuffer.buffer);
        console.log("Verification of written file:");
        console.log("Magic:", verifyView.getUint32(0, true).toString(16));
        const pixelFormatOffset = 76;  // Calculate this based on the structure
        console.log("Pixel format flags at offset", pixelFormatOffset, ":", 
            verifyView.getUint32(pixelFormatOffset + 4, true).toString(16));
        console.log("FourCC at offset", pixelFormatOffset + 8, ":", 
            verifyView.getUint32(pixelFormatOffset + 8, true).toString(16));
    }

    static async readDDS(path) {
        const fileData = await Deno.readFile(path);
        console.log("DDS file size:", fileData.byteLength, "bytes");
        
        const view = new DataView(fileData.buffer);
        let offset = 0;

        // Verify all offsets as we read
        this.logHeaderOffsets("Reading magic at", offset);
        const magic = view.getUint32(offset, true);
        offset += 4;

        this.logHeaderOffsets("Reading header size at", offset);
        const headerSize = view.getUint32(offset, true);
        offset += 4;

        this.logHeaderOffsets("Reading flags at", offset);
        const flags = view.getUint32(offset, true);
        offset += 4;

        const height = view.getUint32(offset, true);
        offset += 4;

        const width = view.getUint32(offset, true);
        offset += 4;

        const linearSize = view.getUint32(offset, true);
        offset += 4;

        // Skip to PIXELFORMAT structure (offset 76)
        offset = 76;
        this.logHeaderOffsets("Reading PIXELFORMAT at", offset);

        // Read pixel format size
        const pfSize = view.getUint32(offset, true);
        offset += 4;

        this.logHeaderOffsets("Reading pixel format flags at", offset);
        const pfFlags = view.getUint32(offset, true);
        offset += 4;

        this.logHeaderOffsets("Reading FourCC at", offset);
        const fourCC = view.getUint32(offset, true);

        // Print all values in hex for debugging
        console.log("Header values (hex):");
        console.log("Magic:", magic.toString(16));
        console.log("Flags:", flags.toString(16));
        console.log("PF Size:", pfSize.toString(16));
        console.log("PF Flags:", pfFlags.toString(16));
        console.log("FourCC:", fourCC.toString(16));

        if (!(pfFlags & DDPF_FOURCC)) {
            throw new Error('Pixel format must be FOURCC');
        }
        if (fourCC !== FOURCC_DXT1) {
            throw new Error('Format must be DXT1');
        }

        // Skip to data (total header size is 128 bytes)
        const dataOffset = 128;
        const compressedData = new Uint32Array(fileData.slice(dataOffset).buffer);

        return {
            width,
            height,
            compressedSize: linearSize,
            compressedData
        };
    }
}