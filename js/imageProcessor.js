/**
 * XToolab Enhanced Image Processing System
 * Handles responsive container dimension detection and intelligent image scaling
 */

class ImageProcessor {
    constructor() {
        this.config = {
            maxWidth: 800,
            maxHeight: 600,
            quality: 0.9,
            maintainAspectRatio: true,
            enableResponsiveScaling: true,
            containerPadding: 20, // Account for container padding
            minWidth: 200,
            minHeight: 150
        };
        
        this.containerObserver = null;
        this.currentContainer = null;
        this.containerDimensions = { width: 0, height: 0 };
        
        this.initializeSystem();
    }

    /**
     * Initialize the image processing system
     */
    initializeSystem() {
        this.setupContainerObserver();
        console.log('ImageProcessor initialized with responsive scaling');
    }

    /**
     * Setup ResizeObserver to monitor container dimension changes
     */
    setupContainerObserver() {
        if (!window.ResizeObserver) {
            console.warn('ResizeObserver not supported, falling back to window resize');
            this.setupFallbackObserver();
            return;
        }

        this.containerObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.updateContainerDimensions(entry.contentRect);
            }
        });
    }

    /**
     * Fallback observer for browsers without ResizeObserver support
     */
    setupFallbackObserver() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateContainerDimensionsFromElement();
            }, 100);
        });
    }

    /**
     * Start observing a specific container element
     * @param {HTMLElement} container - The container element to observe
     */
    observeContainer(container) {
        if (!container) {
            console.error('Cannot observe null container');
            return;
        }

        // Stop observing previous container
        if (this.currentContainer && this.containerObserver) {
            this.containerObserver.unobserve(this.currentContainer);
        }

        this.currentContainer = container;
        
        if (this.containerObserver) {
            this.containerObserver.observe(container);
        }
        
        // Initial dimension calculation
        this.updateContainerDimensionsFromElement();
        
        console.log('Now observing container:', container.id || container.className);
    }

    /**
     * Update container dimensions from ResizeObserver entry
     * @param {Object} contentRect - The content rectangle from ResizeObserver
     */
    updateContainerDimensions(contentRect) {
        const { width, height } = contentRect;
        
        this.containerDimensions = {
            width: Math.max(width - this.config.containerPadding, this.config.minWidth),
            height: Math.max(height - this.config.containerPadding, this.config.minHeight)
        };

        console.log('Container dimensions updated:', this.containerDimensions);
        this.onContainerResize();
    }

    /**
     * Update container dimensions by measuring the element directly
     */
    updateContainerDimensionsFromElement() {
        if (!this.currentContainer) return;

        const rect = this.currentContainer.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(this.currentContainer);
        
        const paddingX = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
        const paddingY = parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
        
        this.containerDimensions = {
            width: Math.max(rect.width - paddingX - this.config.containerPadding, this.config.minWidth),
            height: Math.max(rect.height - paddingY - this.config.containerPadding, this.config.minHeight)
        };

        console.log('Container dimensions updated (fallback):', this.containerDimensions);
        this.onContainerResize();
    }

    /**
     * Handle container resize events
     */
    onContainerResize() {
        // Re-process any existing images in the container
        if (this.currentContainer) {
            const images = this.currentContainer.querySelectorAll('img');
            images.forEach(img => {
                if (!img.dataset.processed) return;
                this.applyResponsiveScaling(img);
            });
        }
    }

    /**
     * Calculate optimal image dimensions based on container and image constraints
     * @param {number} imageWidth - Original image width
     * @param {number} imageHeight - Original image height
     * @returns {Object} Calculated dimensions and scaling info
     */
    calculateOptimalDimensions(imageWidth, imageHeight) {
        if (!imageWidth || !imageHeight) {
            return { width: this.config.minWidth, height: this.config.minHeight, scale: 1, method: 'fallback' };
        }

        const containerWidth = this.containerDimensions.width;
        const containerHeight = this.containerDimensions.height;
        
        // Calculate max allowed dimensions
        const maxWidth = Math.min(containerWidth, this.config.maxWidth);
        const maxHeight = Math.min(containerHeight, this.config.maxHeight);
        
        const imageAspectRatio = imageWidth / imageHeight;
        const containerAspectRatio = maxWidth / maxHeight;
        
        let targetWidth, targetHeight, scale, method;

        if (!this.config.maintainAspectRatio) {
            // Stretch to fill container
            targetWidth = maxWidth;
            targetHeight = maxHeight;
            scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
            method = 'stretch';
        } else {
            // Maintain aspect ratio - fit within container
            if (imageAspectRatio > containerAspectRatio) {
                // Image is wider - constrain by width
                targetWidth = maxWidth;
                targetHeight = maxWidth / imageAspectRatio;
                method = 'width-constrained';
            } else {
                // Image is taller - constrain by height
                targetHeight = maxHeight;
                targetWidth = maxHeight * imageAspectRatio;
                method = 'height-constrained';
            }
            
            scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
        }

        // Ensure minimum dimensions
        if (targetWidth < this.config.minWidth) {
            targetWidth = this.config.minWidth;
            targetHeight = this.config.minWidth / imageAspectRatio;
            method += '-min-width-adjusted';
        }
        
        if (targetHeight < this.config.minHeight) {
            targetHeight = this.config.minHeight;
            targetWidth = this.config.minHeight * imageAspectRatio;
            method += '-min-height-adjusted';
        }

        return {
            width: Math.round(targetWidth),
            height: Math.round(targetHeight),
            scale: scale,
            method: method,
            originalWidth: imageWidth,
            originalHeight: imageHeight
        };
    }

    /**
     * Apply responsive scaling to an image element
     * @param {HTMLImageElement} imageElement - The image element to scale
     */
    applyResponsiveScaling(imageElement) {
        if (!imageElement.complete || !imageElement.naturalWidth) {
            // Image not loaded yet, retry after load
            imageElement.onload = () => this.applyResponsiveScaling(imageElement);
            return;
        }

        const dimensions = this.calculateOptimalDimensions(
            imageElement.naturalWidth,
            imageElement.naturalHeight
        );

        // Apply calculated dimensions
        imageElement.style.width = `${dimensions.width}px`;
        imageElement.style.height = `${dimensions.height}px`;
        imageElement.style.maxWidth = '100%';
        imageElement.style.height = 'auto'; // Override height to maintain aspect ratio
        imageElement.style.objectFit = 'contain';
        imageElement.style.transition = 'all 0.3s ease';

        // Store scaling info for debugging
        imageElement.dataset.scalingMethod = dimensions.method;
        imageElement.dataset.scaleFactor = dimensions.scale.toFixed(2);
        imageElement.dataset.processed = 'true';

        console.log(`Applied responsive scaling: ${dimensions.method}, scale: ${dimensions.scale.toFixed(2)}`);
    }

    /**
     * Enhanced version of createImageFromBinaryData with responsive scaling
     * @param {Uint8Array} uint8Array - Binary image data
     * @param {string} contentType - Image MIME type
     * @returns {HTMLElement} Image container element
     */
    createResponsiveImageFromBinaryData(uint8Array, contentType) {
        try {
            // Convert Uint8Array to Blob
            const blob = new Blob([uint8Array], { type: contentType || 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);

            // Determine file extension
            let fileExtension = 'jpg';
            if (contentType) {
                const mimeType = contentType.split('/')[1];
                if (mimeType === 'jpeg') fileExtension = 'jpg';
                else if (mimeType === 'png') fileExtension = 'png';
                else if (mimeType === 'gif') fileExtension = 'gif';
                else if (mimeType === 'webp') fileExtension = 'webp';
                else if (mimeType === 'svg+xml') fileExtension = 'svg';
                else fileExtension = mimeType || 'jpg';
            }

            // Create image element with responsive features
            const imageElement = document.createElement('img');
            imageElement.blobData = blob;
            imageElement.dataset.fileExtension = fileExtension;
            imageElement.src = imageUrl;
            imageElement.alt = 'Generated Image - Click to download';
            imageElement.loading = 'lazy';
            
            // Enhanced responsive styling
            imageElement.style.borderRadius = '8px';
            imageElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            imageElement.style.transition = 'opacity 0.3s ease, transform 0.2s ease, box-shadow 0.2s ease';
            imageElement.style.cursor = 'pointer';
            
            // Apply responsive scaling when image loads
            imageElement.onload = () => {
                this.applyResponsiveScaling(imageElement);
                imageElement.setAttribute('loaded', 'true');
            };
            
            // Loading state styling
            imageElement.setAttribute('loading', 'true');
            imageElement.style.opacity = '0.6';
            
            // Add hover effects
            imageElement.addEventListener('mouseenter', function() {
                this.style.opacity = '0.8';
                this.style.transform = 'scale(1.02)';
                this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
            });
            
            imageElement.addEventListener('mouseleave', function() {
                this.style.opacity = '1';
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            });

            // Keep original download functionality (unchanged)
            this.attachOriginalDownloadHandler(imageElement);

            // Create responsive container
            const container = document.createElement('div');
            container.className = 'responsive-image-container';
            container.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
                width: 100%;
                min-height: 150px;
                position: relative;
            `;
            
            container.appendChild(imageElement);
            return container;

        } catch (error) {
            console.error('Error creating responsive image:', error);
            return this.createErrorPlaceholder('Error displaying image: ' + error.message);
        }
    }

    /**
     * Attach the original download handler (unchanged from main.js)
     * @param {HTMLImageElement} imageElement
     */
    attachOriginalDownloadHandler(imageElement) {
        const handleDownload = async function(event) {
            event.preventDefault();
            
            try {
                console.log('Starting image download...');
                
                const imageSrc = this.src;
                const fileExtension = this.dataset.fileExtension || 'jpg';
                
                if (this.blobData) {
                    // Use stored blob data if available
                    downloadImageFromBlob(this.blobData, fileExtension);
                } else if (imageSrc.startsWith('blob:')) {
                    // Fetch the blob from the object URL
                    const response = await fetch(imageSrc);
                    const blob = await response.blob();
                    downloadImageFromBlob(blob, fileExtension);
                } else {
                    // Fallback: fetch from regular URL
                    const response = await fetch(imageSrc);
                    const blob = await response.blob();
                    downloadImageFromBlob(blob, fileExtension);
                }
                
            } catch (error) {
                console.error('Error downloading image:', error);
            }
        };
        
        imageElement.addEventListener('click', handleDownload);
        imageElement.title = 'Click to download image';
    }

    /**
     * Create error placeholder element
     * @param {string} message - Error message to display
     * @returns {HTMLElement} Error placeholder element
     */
    createErrorPlaceholder(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'image-error-placeholder';
        errorDiv.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 150px;
            background: #f5f5f5;
            border: 2px dashed #ddd;
            border-radius: 8px;
            color: #666;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            text-align: center;
            padding: 20px;
        `;
        errorDiv.textContent = message;
        return errorDiv;
    }

    /**
     * Update configuration settings
     * @param {Object} newConfig - Configuration updates
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('ImageProcessor configuration updated:', this.config);
    }

    /**
     * Get current container dimensions
     * @returns {Object} Current container dimensions
     */
    getContainerDimensions() {
        return { ...this.containerDimensions };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.containerObserver) {
            this.containerObserver.disconnect();
        }
        this.currentContainer = null;
        this.containerDimensions = { width: 0, height: 0 };
    }
}

// Helper function for downloading images (using existing logic from main.js)
function downloadImageFromBlob(blob, fileExtension) {
    try {
        const link = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = `generated-image-${Date.now()}.${fileExtension}`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        console.log('Image download initiated successfully');
        
    } catch (error) {
        console.error('Error in downloadImageFromBlob:', error);
    }
}

// Export for use in main.js
if (typeof window !== 'undefined') {
    window.ImageProcessor = ImageProcessor;
}