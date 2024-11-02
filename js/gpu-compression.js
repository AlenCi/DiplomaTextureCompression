// gpu-compression.js

export class GPUCompression {
    constructor() {
        this.device = null;
        this.pipelines = null;
        this.bindGroupLayout = null;
    }

    async init() {
        const adapter = await navigator.gpu?.requestAdapter();
        this.device = await adapter.requestDevice();
        await this.setupCompression();
    }

    async setupCompression() {
        const shaderModules = {
            pca: await this.device.createShaderModule({
                code: await fetch('shaders/bc1-compress-pca.wgsl').then(res => res.text())
            }),
            basic: await this.device.createShaderModule({
                code: await fetch('shaders/bc1-compress-basic.wgsl').then(res => res.text()) 
            }),
            random: await this.device.createShaderModule({
                code: await fetch('shaders/bc1-compress-random.wgsl').then(res => res.text())
            })
        };

        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
            ]
        });

        this.pipelines = {
            pca: this.createPipeline(shaderModules.pca),
            basic: this.createPipeline(shaderModules.basic), 
            random: this.createPipeline(shaderModules.random)
        };
    }

    createPipeline(shaderModule) {
        return this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });
    }

    getDevice() {
        return this.device;
    }

    getPipeline(method) {
        return this.pipelines[method];
    }

    getBindGroupLayout() {
        return this.bindGroupLayout;
    }
}