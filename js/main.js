// CONFIGURACIÓN - Cambia este valor para modificar el límite de mensajes
const MAX_FREE_MESSAGES = 3;

// DOM elements - will be initialized after DOM loads
let elements = {};

// App state
const state = {
    isPanelHidden: false,
    isChatMode: false,
    currentSessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),        
    messageCount: 0,
    userRegistered: false,
    monacoEditor: null,
    currentEditorTab: 'editor',
    currentUser: null,
    imageProcessor: null,
    saveTimeout: null
};




// Display editor history in sidebar
function displayEditorHistory(sessions) {
    const historySection = document.querySelector('.history-section');
    if (!historySection) {
        console.log('History section not found in DOM');
        return;
    }

    historySection.innerHTML = '';

    if (sessions.length === 0) {
        historySection.innerHTML = `
            <div class="history-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                No saved prompts yet
            </div>
        `;
        return;
    }

    sessions.forEach(session => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // Mark active session
        if (session.session_id === state.currentSessionId) {
            historyItem.classList.add('active');
        }
        
        historyItem.innerHTML = `
            <div class="history-title">${session.session_title || 'Untitled Prompt'}</div>
            <div class="history-date">${formatDate(session.updated_at)}</div>
        `;
        
        historyItem.addEventListener('click', () => loadEditorSession(session));
        historySection.appendChild(historyItem);
    });
}








// Initialize Monaco Editor
function initMonacoEditor() {
    if (typeof require === 'undefined') {
        console.error('Monaco Editor loader not available');
        return;
    }

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' }});   

    require(['vs/editor/editor.main'], function() {
        try {
            state.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '// Your JSON prompt will appear here\n// Send a message to get started',
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                readOnly: false,
                wordWrap: 'on',
                wordWrapColumn: 80,
                wrappingIndent: 'indent',
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                    alwaysConsumeMouseWheel: false
                },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
                renderLineHighlight: 'line',
                contextmenu: true,
                mouseWheelZoom: false,
                smoothScrolling: true,
                cursorBlinking: 'blink',
                cursorSmoothCaretAnimation: true,
                lineHeight: 20,
                padding: {
                    top: 10,
                    bottom: 10
                },
                folding: true,
                foldingStrategy: 'indentation',
                showFoldingControls: 'always',
                unfoldOnClickAfterEndOfLine: false,
                selectOnLineNumbers: true
            });

            console.log('Monaco Editor initialized successfully');
            
            // Setup auto-save functionality
            setupEditorAutoSave();

            // Add resize listener to ensure editor fits properly
            const editorElement = document.getElementById('monaco-editor');
            const resizeObserver = new ResizeObserver(() => {
                if (state.monacoEditor) {
                    state.monacoEditor.layout();
                }
            });
            
            if (editorElement) {
                resizeObserver.observe(editorElement);
            }

            // Ensure proper initial layout
            setTimeout(() => {
                if (state.monacoEditor) {
                    state.monacoEditor.layout();
                }
            }, 100);

        } catch (error) {
            console.error('Error initializing Monaco Editor:', error);
        }
    });
}

// Switch between editor tabs
function switchEditorTab(tabName) {
    // Update active tab
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show active content
    document.querySelectorAll('.editor-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName + 'Content');
    });

    state.currentEditorTab = tabName;

    // If switching to editor tab, resize the editor
    if (tabName === 'editor' && state.monacoEditor) {
        setTimeout(() => state.monacoEditor.layout(), 100);
    }
}

// Update Monaco Editor content
function updateEditorContent(content) {
    if (state.monacoEditor) {
        state.monacoEditor.setValue(content);
    } else {
        // If editor not initialized yet, wait and try again
        setTimeout(() => updateEditorContent(content), 500);
    }
}

// Update response content
function updateResponseContent(content) {
    if (!elements.monacoResponse) return;

    // Clear existing content
    elements.monacoResponse.innerHTML = '';

    // Handle DOM elements directly (like images)
    if (content && typeof content === 'object' && content.nodeType === Node.ELEMENT_NODE) {
        elements.monacoResponse.appendChild(content);
    }
    // Handle HTML strings (but re-attach event listeners for images)
    else if (content && typeof content === 'string' && content.includes('<')) {
        elements.monacoResponse.innerHTML = content;
        // Re-attach click handlers to images that lost their event listeners
        reattachImageEventListeners();
    }
    // Handle plain text content
    else {
        elements.monacoResponse.textContent = content || '';
    }
}

// Re-attach event listeners to images after innerHTML insertion
function reattachImageEventListeners() {
    const images = elements.monacoResponse.querySelectorAll('.image-response-container img');
    images.forEach(img => {
        if (!img.hasAttribute('data-download-attached')) {
            attachImageDownloadHandler(img);
            img.setAttribute('data-download-attached', 'true');
        }
    });
}

// Attach download functionality to an image element
function attachImageDownloadHandler(imageElement) {
    // Get the blob data from the src (reconstruct from object URL if needed)
    const handleDownload = async function(event) {
        event.preventDefault();
        
        try {
            // Show download feedback
            showDownloadFeedback('Preparing download...');
            
            // Get the image source
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
            showDownloadFeedback('Download failed. Please try again.', true);
        }
    };
    
    imageElement.addEventListener('click', handleDownload);
    imageElement.style.cursor = 'pointer';
    imageElement.title = 'Click to download image';
}

// Download image from blob data
function downloadImageFromBlob(blob, fileExtension) {
    try {
        const link = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = `generated-image-${Date.now()}.${fileExtension}`;
        
        // Add to DOM temporarily for cross-browser compatibility
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        
        // Clean up the object URL after a delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
        console.error('Error downloading image blob:', error);
    }
}

// Show download feedback function (referenced but missing)
function showDownloadFeedback(message, isError = false) {
    // Create or update download feedback element
    let feedbackElement = document.getElementById('download-feedback');
    if (!feedbackElement) {
        feedbackElement = document.createElement('div');
        feedbackElement.id = 'download-feedback';
        feedbackElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(feedbackElement);
    }
    
    feedbackElement.textContent = message;
    feedbackElement.style.backgroundColor = isError ? '#ef4444' : '#22c55e';
    feedbackElement.style.opacity = '1';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        feedbackElement.style.opacity = '0';
    }, 3000);
}

// Update dynamic bottom text
function updateDynamicBottomText(content, isLoading = false, isError = false) {
    if (!elements.dynamicBottomText) return;
    
    elements.dynamicBottomText.textContent = content;
    elements.dynamicBottomText.style.color = '#a1a1a1';
}

// Show message limit warning
function showMessageLimitWarning() {
    if (elements.messageLimitWarning && !state.userRegistered) {
        elements.messageLimitWarning.classList.add('show');
        setTimeout(() => {
            elements.messageLimitWarning.classList.remove('show');
        }, 5000);
    }
}

// Toggle sidebar visibility
function toggleSidebar() {
    if (elements.sidebar) {
        elements.sidebar.classList.toggle('hidden');
    }
}

// Toggle panel visibility
function togglePanel() {
    state.isPanelHidden = !state.isPanelHidden;

    if (state.isPanelHidden) {
        elements.sidebar?.classList.add('hidden');
        elements.mainContent?.classList.add('full-width');
        if (state.isChatMode) {
            elements.chatInputFixed?.classList.add('full-width');
        }
        // Update toggle button icon
        if (elements.togglePanelBtn) {
            elements.togglePanelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="9" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="9" y1="18" x2="21" y2="18"/>
                </svg>
            `;
        }
    } else {
        elements.sidebar?.classList.remove('hidden');
        elements.mainContent?.classList.remove('full-width');
        if (state.isChatMode) {
            elements.chatInputFixed?.classList.remove('full-width');
        }
        // Revert toggle button icon
        if (elements.togglePanelBtn) {
            elements.togglePanelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="6" x2="15" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="15" y2="18"/>
                </svg>
            `;
        }
    }
}

// Start a new chat session
function startNewChat() {
    // Clear chat messages
    if (elements.messagesContainer) {
        elements.messagesContainer.innerHTML = '';
        elements.messagesContainer.style.display = 'none';
    }
    if (elements.editorContainer) {
        elements.editorContainer.style.display = 'none';
    }
    if (elements.welcomeSection) {
        elements.welcomeSection.style.display = 'block';
    }
    if (elements.chatInputFixed) {
        elements.chatInputFixed.style.display = 'none';
    }

    state.isChatMode = false;

    // Start new editor session
    startNewEditorSession();

    console.log('Starting new chat...');
}

// Send message to API
async function sendToAPI(message, webhookUrl, editorContent) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                sessionId: state.currentSessionId,
                prompt: editorContent
            })
        });

        if (response.ok) {
            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return parseApiResponse(data);
            } else if (contentType && (contentType.includes('image/') || contentType.includes('application/octet-stream'))) {
                // Handle binary responses (images)
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                return parseApiResponse(uint8Array, contentType);
            } else {
                // Handle text responses
                const textData = await response.text();
                console.log('Received text response:', textData.substring(0, 100) + '...');
                return parseApiResponse(textData);
            }
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

// Show registration modal
function showRegistrationModal() {
    if (elements.registerModal) {
        elements.registerModal.style.display = 'flex';
    }
}

// Close modal
function closeModal() {
    if (elements.registerModal) {
        elements.registerModal.style.display = 'none';
    }
}





// Send message from main input
async function sendMessage() {
    console.log('DEBUG: sendMessage called');
    console.log('DEBUG: elements.messageInput:', elements.messageInput);

    const message = elements.messageInput?.value.trim();
    console.log('DEBUG: message value:', message);

    if (message) {
        await processMessage(message);
    } else {
        console.log('DEBUG: No message to send');
    }
}

// Send message from fixed input
async function sendMessageFixed() {
    console.log('DEBUG: sendMessageFixed called');
    console.log('DEBUG: elements.messageInputFixed:', elements.messageInputFixed);

    const message = elements.messageInputFixed?.value.trim();
    console.log('DEBUG: message value:', message);

    if (message) {
        await processMessage(message, true);
    } else {
        console.log('DEBUG: No message to send from fixed input');
    }
}

// Process message (shared functionality)
async function processMessage(message, isFixed = false) {
    console.log('DEBUG: processMessage called with message:', message, 'isFixed:', isFixed);

    // Check if user has reached message limit
    if (state.messageCount >= MAX_FREE_MESSAGES && !state.userRegistered) {
        showMessageLimitWarning();
        showRegistrationModal();
        return;
    }

    // Switch to chat mode if not already
    switchToChatMode();

    // Add user message to chat
    addMessage(message, 'user');

    // Increment message count for non-registered users
    if (!state.userRegistered) {
        state.messageCount++;
    }

    // Clear input
    const inputElement = isFixed ? elements.messageInputFixed : elements.messageInput;
    console.log('DEBUG: inputElement to clear:', inputElement);
    if (inputElement) {
        inputElement.value = '';
        inputElement.style.height = 'auto';
    } else {
        console.error('DEBUG: inputElement is null!');
    }

    // Show loading indicator
    console.log('DEBUG: elements.loadingIndicator:', elements.loadingIndicator);
    if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'block';
    } else {
        console.error('DEBUG: loadingIndicator element not found!');
    }

    try {
        console.log('DEBUG: Sending message to API...');
        // Send message to API
        const botResponse = await sendToAPI(message, 'https://7144fb0822b5.ngrok-free.app/webhook/f07ef21d-dae3-45ce-b457-57541e686137');
        console.log('DEBUG: API response received:', botResponse);

        // Update Monaco Editor with the response
        console.log('DEBUG: Updating editor content...');
        updateEditorContent(botResponse);

        // Save the editor session after updating content
        if (state.currentUser) {
            setTimeout(saveEditorSession, 1000);
        }

        // After updating editor, send editor content to second webhook for dynamic bottom text
        setTimeout(async () => {
            try {
                console.log('DEBUG: Sending editor content to second webhook...');
                updateDynamicBottomText('Loading...', true); // Show loading state

                const editorContent = state.monacoEditor ? state.monacoEditor.getValue() : botResponse;
                console.log('DEBUG: Editor content for second webhook:', editorContent);
                const dynamicResponse = await sendToAPI(editorContent, 'https://7144fb0822b5.ngrok-free.app/webhook/78ec2241-6c9e-4d60-87ef-d1f30efec796');
                console.log('DEBUG: Dynamic response received:', dynamicResponse);

                // Update dynamic bottom text with response
                updateDynamicBottomText(dynamicResponse);
            } catch (error) {
                console.error('Error with dynamic bottom text webhook:', error);
                updateDynamicBottomText('Failed to load dynamic content', false, true);
            }
        }, 500);

    } catch (error) {
        console.error('DEBUG: Error in processMessage:', error);
        updateEditorContent("// Sorry, I'm having trouble connecting to the server.\n// Please try again later.");
        updateDynamicBottomText('Connection error', false, true);
    } finally {
        // Hide loading indicator
        if (elements.loadingIndicator) {
            elements.loadingIndicator.style.display = 'none';
        }

        // Check if we need to show the modal after this message
        if (state.messageCount >= MAX_FREE_MESSAGES && !state.userRegistered) {
            setTimeout(() => {
                showMessageLimitWarning();
                showRegistrationModal();
            }, 1000);
        }
    }
}

// Send editor content to webhook
async function sendEditorContent() {
    console.log('DEBUG: sendEditorContent called');
    console.log('DEBUG: state.monacoEditor:', state.monacoEditor);

    if (!state.monacoEditor) {
        alert('Editor is not ready yet. Please try again.');
        return;
    }

    const editorContent = state.monacoEditor.getValue().trim();
    console.log('DEBUG: editorContent:', editorContent);

    if (!editorContent) {
        alert('Editor is empty. Please add some content first.');
        return;
    }

    // Show loading indicator
    console.log('DEBUG: elements.loadingIndicator:', elements.loadingIndicator);
    if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'block';
    } else {
        console.error('DEBUG: loadingIndicator element not found!');
    }

    try {
        console.log('DEBUG: Switching to response tab...');
        switchEditorTab('response');
        // Send editor content to the specified webhook
        console.log('DEBUG: Sending editor content to generate-image webhook...');
        const response = await sendToAPI(editorContent, 'https://7144fb0822b5.ngrok-free.app/webhook/generate-image');
        console.log('DEBUG: Image generation response:', response);

        // Update response content and switch to response tab
        console.log('DEBUG: Updating response content...');
        updateResponseContent(response);

    } catch (error) {
        console.error('Error sending editor content:', error);
        updateResponseContent('Error: Unable to process content. Please try again.');
    } finally {
        // Hide loading indicator
        if (elements.loadingIndicator) {
            elements.loadingIndicator.style.display = 'none';
        }
    }
}

// Add message to chat
function addMessage(text, sender) {
    if (!elements.messagesContainer) return;

    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    // Create avatar
    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar');
    avatar.textContent = sender === 'user' ? 'U' : 'X';

    // Create content container
    const content = document.createElement('div');
    content.classList.add('message-content');
    content.textContent = text;

    // Add elements to message
    messageElement.appendChild(avatar);
    messageElement.appendChild(content);

    elements.messagesContainer.appendChild(messageElement);

    // Scroll to bottom of chat
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// Handle key press in text inputs
function handleKeyPress(event, inputElement) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (inputElement.id === 'messageInputFixed') {
            sendMessageFixed();
        } else {
            sendMessage();
        }
    }

    // Auto-resize textarea
    inputElement.style.height = 'auto';
    inputElement.style.height = inputElement.scrollHeight + 'px';
}

// Switch to chat mode
function switchToChatMode() {
    if (!state.isChatMode) {
        state.isChatMode = true;
        if (elements.welcomeSection) elements.welcomeSection.style.display = 'none';
        if (elements.messagesContainer) elements.messagesContainer.style.display = 'none';
        if (elements.editorContainer) elements.editorContainer.style.display = 'block';
        if (elements.chatInputFixed) elements.chatInputFixed.style.display = 'block';

        if (state.isPanelHidden && elements.chatInputFixed) {
            elements.chatInputFixed.classList.add('full-width');
        }
    }
}

// Parse API response data
function parseApiResponse(data, contentType = null) {
    console.log('DEBUG: parseApiResponse called with data type:', typeof data, 'contentType:', contentType);
    console.log('DEBUG: data value:', data);

    try {
        // Handle null or undefined
        if (!data) {
            console.log('DEBUG: No response data received');
            return "No response data received";
        }

        // Handle binary data (Uint8Array)
        if (data instanceof Uint8Array) {
            console.log('DEBUG: Handling binary data (Uint8Array)');
            return createImageFromBinaryData(data, contentType);
        }

        // Handle string responses first
        if (typeof data === 'string') {
            console.log('DEBUG: Handling string response');
            // Check if this looks like binary data (starts with non-printable characters)
            if (data.length > 0 && data.charCodeAt(0) < 32 && data.charCodeAt(0) !== 10 && data.charCodeAt(0) !== 13) {
                console.log('DEBUG: Detected binary data in string response');
                return "Received binary data (likely an image or file). Cannot display as text.";
            }
            // Check for common binary file signatures
            if (data.startsWith('\xFF\xD8\xFF') || data.startsWith('\x89PNG') || data.startsWith('GIF8') || data.startsWith('RIFF')) {
                console.log('DEBUG: Detected image data in string response');
                return "Received image data. Cannot display binary content as text.";
            }
            return data;
        }

        // Quick debug - just log the keys for object responses
        if (data && typeof data === 'object') {
            console.log("API Response Keys:", Object.keys(data));
        }

        // Handle object responses
        if (typeof data === 'object' && data !== null) {
            console.log('DEBUG: Handling object response');
            // Handle array responses
            if (Array.isArray(data) && data.length > 0) {
                console.log('DEBUG: Handling array response');
                if (data[0] && typeof data[0] === 'object') {
                    if (data[0].output) return data[0].output;
                    if (data[0].response) return data[0].response;
                    if (data[0].text) return data[0].text;
                    if (data[0].content) return data[0].content;
                }
                if (typeof data[0] === 'string') return data[0];
                return JSON.stringify(data[0], null, 2);
            }
            // Handle single object responses
            else {
                console.log('DEBUG: Handling single object response');
                // Check common response fields
                if (data.output) return data.output;
                if (data.response) return data.response;
                if (data.message) return data.message;
                if (data.text) return data.text;
                if (data.content) return data.content;
                if (data.result) return data.result;
                if (data.data) return data.data;
                if (data.generated_text) return data.generated_text;
                if (data.completion) return data.completion;

                // OpenAI format
                if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
                    if (data.choices[0].message && data.choices[0].message.content) {
                        return data.choices[0].message.content;
                    }
                    if (data.choices[0].text) return data.choices[0].text;
                }

                // Show available keys for debugging
                const keys = Object.keys(data).slice(0, 5).join(', ');
                return `Response object found with keys: ${keys}. Please check which key contains your content.`;
            }
        }

        // Fallback
        console.log('DEBUG: Unexpected response type:', typeof data);
        return "Unexpected response type: " + typeof data;

    } catch (error) {
        console.error("Error parsing API response:", error);
        return "Error parsing response: " + error.message;
    }
}

// Enhanced create image element from binary data with responsive processing
function createImageFromBinaryData(uint8Array, contentType) {
    console.log('DEBUG: createImageFromBinaryData called with contentType:', contentType);
    try {
        // Use ImageProcessor if available, otherwise fall back to original method
        if (state.imageProcessor) {
            console.log('DEBUG: Using enhanced ImageProcessor for binary data');
            return state.imageProcessor.createResponsiveImageFromBinaryData(uint8Array, contentType);
        } else {
            console.warn('DEBUG: ImageProcessor not available, using fallback method');
            return createImageFromBinaryDataFallback(uint8Array, contentType);
        }
    }
    // TEMPORARY: Adding catch to prevent syntax error while debugging
    catch (error) {
        console.error('DEBUG: Error in createImageFromBinaryData:', error);
        return createImageFromBinaryDataFallback(uint8Array, contentType);
    }
}

// Fallback method (original implementation)
function createImageFromBinaryDataFallback(uint8Array, contentType) {
    try {
        // Convert Uint8Array to Blob
        const blob = new Blob([uint8Array], { type: contentType || 'image/jpeg' });

        // Create object URL for the blob
        const imageUrl = URL.createObjectURL(blob);

        // Determine file extension from content type
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

        // Create image element
        const imageElement = document.createElement('img');
        
        // Store blob data and file extension for download functionality
        imageElement.blobData = blob;
        imageElement.dataset.fileExtension = fileExtension;
        imageElement.src = imageUrl;
        imageElement.style.maxWidth = '100%';
        imageElement.style.height = 'auto';
        imageElement.style.borderRadius = '8px';
        imageElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        imageElement.style.transition = 'opacity 0.3s ease, transform 0.2s ease, box-shadow 0.2s ease';
        imageElement.loading = 'lazy';
        
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

        // Attach download functionality using the original handler
        attachImageDownloadHandler(imageElement);

        // Create container for the image
        const container = document.createElement('div');
        container.className = 'image-response-container';
        container.appendChild(imageElement);

        // Return DOM element directly instead of HTML string to preserve event listeners
        return container;

    } catch (error) {
        console.error('Error creating image from binary data (fallback):', error);
        return "Error displaying image: " + error.message;
    }
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function(event) {
    const menuToggle = document.querySelector('.menu-toggle');

    if (window.innerWidth <= 768 &&
        elements.sidebar &&
        !elements.sidebar.contains(event.target) &&
        menuToggle && !menuToggle.contains(event.target) &&
        !elements.sidebar.classList.contains('hidden')) {
        elements.sidebar.classList.add('hidden');
    }
});

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('XToolab initialized with session ID:', state.currentSessionId);
    console.log('Free message limit:', MAX_FREE_MESSAGES);
    console.log('Database ID:', DATABASE_ID);

    // Initialize DOM elements after DOM is ready
    elements = {
        sidebar: document.getElementById('sidebar'),
        mainContent: document.getElementById('mainContent'),
        welcomeSection: document.getElementById('welcomeSection'),
        messagesContainer: document.getElementById('messagesContainer'),
        editorContainer: document.getElementById('editorContainer'),
        editorContent: document.getElementById('editorContent'),
        responseContent: document.getElementById('responseContent'),
        responseTab: document.getElementById('responseTab'),
        messageInput: document.getElementById('messageInput'),
        messageInputFixed: document.getElementById('messageInputFixed'),
        chatInputFixed: document.getElementById('chatInputFixed'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        togglePanelBtn: document.getElementById('togglePanelBtn'),
        registerModal: document.getElementById('registerModal'),
        monacoResponse: document.getElementById('monaco-response'),
        loginBtn: document.getElementById('loginBtn'),
        userProfile: document.getElementById('userProfile'),
        userAvatar: document.getElementById('userAvatar'),
        userName: document.getElementById('userName'),
        messageLimitWarning: document.getElementById('messageLimitWarning'),
        dynamicBottomText: document.getElementById('dynamicBottomText')
    };

    checkAuthFromURL();

    // Initialize ImageProcessor
    if (window.ImageProcessor) {
        state.imageProcessor = new ImageProcessor();

        // Start observing the response container
        if (elements.monacoResponse) {
            state.imageProcessor.observeContainer(elements.monacoResponse);
        }

        console.log('ImageProcessor initialized and observing response container');
    }

    // Add event listeners for textareas
    const messageInput = document.getElementById('messageInput');
    const messageInputFixed = document.getElementById('messageInputFixed');

    console.log('DEBUG: messageInput element:', messageInput);
    console.log('DEBUG: messageInputFixed element:', messageInputFixed);

    if (messageInput) {
        messageInput.addEventListener('keydown', function(event) {
            handleKeyPress(event, this);
        });
        console.log('DEBUG: Added event listener to messageInput');
    } else {
        console.error('DEBUG: messageInput element not found!');
    }

    if (messageInputFixed) {
        messageInputFixed.addEventListener('keydown', function(event) {
            handleKeyPress(event, this);
        });
        console.log('DEBUG: Added event listener to messageInputFixed');
    } else {
        console.error('DEBUG: messageInputFixed element not found!');
    }
});

// Initialize Monaco Editor when page loads
window.addEventListener('load', function() {
    initMonacoEditor();

    // Double-check auth status after everything loads
    setTimeout(checkAuthStatus, 2000);
});