// file-handler.js

export class FileHandler {
    constructor(onImageLoad) {
        this.onImageLoad = onImageLoad;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('image-upload')
            .addEventListener('change', this.handleFileUpload.bind(this));
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const image = new Image();
                image.onload = () => {
                    this.onImageLoad(image);
                }
                image.src = e.target.result;
            }
            reader.readAsDataURL(file);
        }
    }
}