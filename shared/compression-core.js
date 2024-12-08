// shared/compression-core.js

export class CompressionCore {
    constructor(device) {
        this.device = device;
        this.pipelines = null;
        this.bindGroupLayout = null;
    }

    async init(shaderSources) {
        // Debug print
        console.log("Shader sources received:", {
            pca: shaderSources?.pca ? 'present' : 'missing',
            basic: shaderSources?.basic ? 'present' : 'missing',
            random: shaderSources?.random ? 'present' : 'missing',
            cluster: shaderSources?.cluster ? 'present' : 'missing'
        });

        const shaderModules = {
            pca: await this.device.createShaderModule({
                code: shaderSources.pca
            }),
            basic: await this.device.createShaderModule({
                code: shaderSources.basic
            }),
            random: await this.device.createShaderModule({
                code: shaderSources.random
            }),
            cluster: await this.device.createShaderModule({
                code:shaderSources.cluster
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
            random: this.createPipeline(shaderModules.random),
            cluster: this.createPipeline(shaderModules.cluster)
        };
    }
    createPipeline(shaderModule) {
        return this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });
    }

    getPipeline(method) {
        return this.pipelines[method];
    }

    getBindGroupLayout() {
        return this.bindGroupLayout;
    }
}