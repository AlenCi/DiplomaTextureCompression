// web/gpu-setup.js
import { CompressionCore } from '../shared/compression-core.js';

export class GPUSetup {
    constructor() {
        this.device = null;
        this.compressionCore = null;
    }

    async init() {
        const adapter = await navigator.gpu?.requestAdapter();
        this.device = await adapter.requestDevice();
        
        // Load shaders in web-specific way
        const shaderSources = {
            pca: await fetch('../shared/shaders/bc1-compress-pca.wgsl').then(res => res.text()),
            basic: await fetch('../shared/shaders/bc1-compress-basic.wgsl').then(res => res.text()),
            random: await fetch('../shared/shaders/bc1-compress-random.wgsl').then(res => res.text()),
            cluster: await fetch('../shared/shaders/bc1-compress-cluster.wgsl').then(res => res.text())
        };

        this.compressionCore = new CompressionCore(this.device);
        await this.compressionCore.init(shaderSources);
    }

    getDevice() {
        return this.device;
    }

    getPipeline(method) {
        return this.compressionCore.getPipeline(method);
    }

    getBindGroupLayout() {
        return this.compressionCore.getBindGroupLayout();
    }
}