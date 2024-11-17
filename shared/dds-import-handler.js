
export class DDSImportHandler {
    static async loadDDS(file) {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 0;

        // Check magic number
        const magic = view.getUint32(offset, true);
        if (magic !== 0x20534444) { // "DDS "
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

        // Skip to pixel format (offset 76)
        offset = 76;

        // Read pixel format size
        offset += 4;

        // Check format (must be DXT1)
        const pfFlags = view.getUint32(offset, true);
        offset += 4;
        const fourCC = view.getUint32(offset, true);

        if (!(pfFlags & 0x4) || fourCC !== 0x31545844) {
            throw new Error('Unsupported format - must be DXT1');
        }

        // Skip to data (total header size is 128 bytes)
        const dataOffset = 128;
        const compressedData = new Uint32Array(buffer.slice(dataOffset));

        return {
            width,
            height,
            compressedData
        };
    }
}