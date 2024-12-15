// web/gpu-setup.js
import { CompressionCore } from '../shared/compression-core.js';

export class GPUSetup {
    constructor() {
        this.device = null;
        this.compressionCore = null;
    }

    getBasePath() {
        // For GitHub Pages, we need to include the repository name
        const repoName = 'DiplomaTextureCompression';
        
        // Check if we're on GitHub Pages
        if (window.location.hostname.includes('github.io')) {
            return `/${repoName}/`;
        }
        
        // For local development, use relative path
        return '/';
    }

    async init() {
        const adapter = await navigator.gpu?.requestAdapter();
        this.device = await adapter.requestDevice();

        const basePath = this.getBasePath();
        
        // Load shaders in web-specific way
        const shaderSources = {
            pca: await fetch(`${basePath}shared/shaders/bc1-compress-pca.wgsl`).then(res => res.text()),
            basic: await fetch(`${basePath}shared/shaders/bc1-compress-basic.wgsl`).then(res => res.text()),
            random: await fetch(`${basePath}shared/shaders/bc1-compress-random.wgsl`).then(res => res.text()),
            cluster: await fetch(`${basePath}shared/shaders/bc1-compress-cluster.wgsl`).then(res => res.text())
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